import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, rejects, type Db, type TestUser } from "./harness";

let db: Db;
let owner: TestUser, partner: TestUser;
let W: string;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "org-owner@example.test", "Owner");
  partner = await createUser(db, "org-partner@example.test", "Partner");
  W = await as(db, owner, async (tx) => {
    const id = (await tx.query<{ id: string }>(`insert into workspaces (name, owner_id) values ('Org', $1) returning id`, [owner.id])).rows[0].id;
    await tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [id, partner.id]);
    return id;
  });
});

describe("waiting-for", () => {
  it("links a task to a contact of the same workspace only", async () => {
    const otherContact = await as(db, owner, async (tx) =>
      (await tx.query<{ id: string }>(`insert into contacts (workspace_id, name) values ($1, 'Elsewhere') returning id`, [owner.personalWorkspace])).rows[0].id,
    );
    const msg = await rejects(
      as(db, owner, async (tx) => {
        await tx.query(`insert into tasks (workspace_id, title, waiting_on_contact_id) values ($1, 'x', $2)`, [W, otherContact]);
      }),
    );
    expect(msg).toMatch(/another workspace/);
  });

  it("a partner sees the waiting-for contact on a shared task", async () => {
    const contact = await as(db, owner, async (tx) => (await tx.query<{ id: string }>(`insert into contacts (workspace_id, name) values ($1, 'CTO') returning id`, [W])).rows[0].id);
    const project = await as(db, owner, async (tx) => (await tx.query<{ id: string }>(`insert into projects (workspace_id, name, owner_id) values ($1, 'P', $2) returning id`, [W, owner.id])).rows[0].id);
    await as(db, owner, (tx) => tx.query(`insert into tasks (workspace_id, project_id, title, status, waiting_on_contact_id, waiting_since, follow_up_date) values ($1, $2, 'Spec', 'waiting', $3, '2030-01-01', '2030-01-05')`, [W, project, contact]));
    const rows = await as(db, partner, async (tx) => (await tx.query<{ name: string }>(`select c.name from tasks t join contacts c on c.id = t.waiting_on_contact_id where t.title = 'Spec'`)).rows);
    expect(rows).toEqual([{ name: "CTO" }]);
  });
});

describe("routines", () => {
  it("are private unless shared with the workspace", async () => {
    await as(db, owner, (tx) => tx.query(`insert into routines (workspace_id, owner_id, name) values ($1, $2, 'Mine'), ($1, $2, 'Ours')`, [W, owner.id]));
    await as(db, owner, (tx) => tx.query(`update routines set visibility = 'workspace' where name = 'Ours'`));
    const seen = await as(db, partner, async (tx) => (await tx.query<{ name: string }>(`select name from routines order by name`)).rows.map((r) => r.name));
    expect(seen).toEqual(["Ours"]);
    // the partner can track their own run of a shared routine, but not change the routine
    const r = await as(db, partner, async (tx) => (await tx.query<{ id: string }>(`select id from routines where name = 'Ours'`)).rows[0].id);
    await as(db, partner, (tx) => tx.query(`insert into routine_runs (routine_id, user_id, date) values ($1, $2, '2030-01-01')`, [r, partner.id]));
    const changed = await as(db, partner, async (tx) => (await tx.query(`update routines set name = 'Hijacked' where id = $1 returning 1`, [r])).rows.length);
    expect(changed).toBe(0);
  });
});

describe("daily slots", () => {
  it("claims the shutdown reminder once per day", async () => {
    const claim = () => db.query<{ ok: boolean }>(`select public.claim_daily_slot($1, 'shutdown', '2030-01-01') as ok`, [owner.id]);
    expect((await claim()).rows[0].ok).toBe(true);
    expect((await claim()).rows[0].ok).toBe(false);
  });
});
