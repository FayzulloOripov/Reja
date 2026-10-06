import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, type Db, type TestUser } from "./harness";

let db: Db;
let owner: TestUser, partner: TestUser, guest: TestUser;
let W: string, shared: string, priv: string, P: string;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@example.test");
  partner = await createUser(db, "partner@example.test");
  guest = await createUser(db, "guest@example.test");
  await as(db, owner, async (tx) => {
    W = (await tx.query<{ id: string }>(`insert into workspaces (name, owner_id) values ('Team', $1) returning id`, [owner.id])).rows[0].id;
    await tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'guest')`, [W, partner.id, guest.id]);
    shared = (await tx.query<{ id: string }>(`insert into areas (workspace_id, name, owner_id) values ($1, 'Agentlik', $2) returning id`, [W, owner.id])).rows[0].id;
    priv = (await tx.query<{ id: string }>(`insert into areas (workspace_id, name, owner_id, visibility) values ($1, 'Shaxsiy', $2, 'private') returning id`, [W, owner.id])).rows[0].id;
    P = (await tx.query<{ id: string }>(`insert into projects (workspace_id, name, owner_id, area_id) values ($1, 'Client A', $2, $3) returning id`, [W, owner.id, shared])).rows[0].id;
  });
});

const visible = (u: TestUser) => as(db, u, async (tx) => (await tx.query<{ name: string }>(`select name from areas order by name`)).rows.map((r) => r.name));

describe("areas RLS", () => {
  it("shared areas are visible to full members, private ones only to their owner", async () => {
    expect(await visible(owner)).toEqual(["Agentlik", "Shaxsiy"]);
    expect(await visible(partner)).toEqual(["Agentlik"]);
  });

  it("guests see only the areas of projects shared with them", async () => {
    expect(await visible(guest)).toEqual([]);
    await as(db, owner, (tx) => tx.query(`insert into project_members (project_id, user_id, role) values ($1, $2, 'member')`, [P, guest.id]));
    expect(await visible(guest)).toEqual(["Agentlik"]);
  });

  it("guests cannot create shared areas; members can", async () => {
    await expect(as(db, guest, (tx) => tx.query(`insert into areas (workspace_id, name, owner_id) values ($1, 'X', $2)`, [W, guest.id]))).rejects.toThrow(/row-level security/);
    await as(db, partner, (tx) => tx.query(`insert into areas (workspace_id, name, owner_id) values ($1, 'Partner area', $2)`, [W, partner.id]));
  });

  it("a project cannot be put in an area of another workspace", async () => {
    await expect(as(db, owner, (tx) => tx.query(`update projects set area_id = $1 where id = $2`, [priv, P]))).resolves.toBeDefined();
    await expect(
      as(db, owner, async (tx) => {
        const area = (await tx.query<{ id: string }>(`insert into areas (workspace_id, name, owner_id) values ($1, 'Mine', $2) returning id`, [owner.personalWorkspace, owner.id])).rows[0].id;
        await tx.query(`update projects set area_id = $1 where id = $2`, [area, P]);
      }),
    ).rejects.toThrow(/another workspace/);
  });

  it("deleting an area keeps its projects", async () => {
    await as(db, owner, (tx) => tx.query(`delete from areas where id = $1`, [priv]));
    const p = await as(db, owner, (tx) => tx.query<{ area_id: string | null }>(`select area_id from projects where id = $1`, [P]));
    expect(p.rows[0].area_id).toBeNull();
  });
});
