import { beforeAll, describe, expect, it } from "vitest";
import { as, asService, createDb, createUser, rejects, type Db, type TestUser } from "./harness";

let db: Db;
let owner: TestUser, guest: TestUser;
let W: string, P: string;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "o@example.test", "Owner");
  guest = await createUser(db, "g@example.test", "Guest");
  await as(db, owner, async (tx) => {
    W = (await tx.query<{ id: string }>(`insert into workspaces (name, owner_id) values ('W', $1) returning id`, [owner.id])).rows[0].id;
    P = (await tx.query<{ id: string }>(`insert into projects (workspace_id, name, owner_id) values ($1, 'P', $2) returning id`, [W, owner.id])).rows[0].id;
    await tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'guest')`, [W, guest.id]);
    await tx.query(`insert into project_members (project_id, user_id, role) values ($1, $2, 'member')`, [P, guest.id]);
    const a = (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title, due_date) values ($1, $2, 'Assigned to guest', current_date) returning id`, [W, P])).rows[0].id;
    await tx.query(`insert into task_assignees (task_id, user_id) values ($1, $2)`, [a, guest.id]);
    await tx.query(`insert into tasks (workspace_id, project_id, title, due_date) values ($1, $2, 'Mine, unassigned', current_date)`, [W, P]);
    await tx.query(`insert into tasks (workspace_id, title, due_date, top_date) values ($1, 'Inbox top', null, current_date)`, [owner.personalWorkspace]);
    await tx.query(`insert into time_blocks (date, start_at, end_at, title) values (current_date, now(), now() + interval '1 hour', 'Deep work')`);
  });
});

describe("responsible_open_tasks", () => {
  it("returns assigned tasks and own unassigned tasks", async () => {
    const titles = async (u: TestUser) =>
      asService(db, async (tx) =>
        (await tx.query<{ title: string }>(`select title from responsible_open_tasks($1, current_date + 7) order by title`, [u.id])).rows.map((r) => r.title),
      );
    expect(await titles(owner)).toEqual(["Inbox top", "Mine, unassigned"]);
    expect(await titles(guest)).toEqual(["Assigned to guest"]);
  });

  it("drops tasks once the user loses access", async () => {
    await as(db, owner, (tx) => tx.query(`delete from project_members where project_id = $1 and user_id = $2`, [P, guest.id]));
    const rows = await asService(db, async (tx) => (await tx.query(`select 1 from responsible_open_tasks($1, current_date + 7)`, [guest.id])).rows);
    expect(rows).toHaveLength(0);
  });

  it("is not callable by signed-in users", async () => {
    expect(await rejects(as(db, owner, (tx) => tx.query(`select * from responsible_open_tasks($1, current_date)`, [owner.id])))).toMatch(/permission denied/);
  });
});

describe("ics_items", () => {
  it("returns dated tasks and time blocks for a valid token only", async () => {
    const token = await asService(db, async (tx) => (await tx.query<{ ics_token: string }>(`select ics_token from profiles where id = $1`, [owner.id])).rows[0].ics_token);
    const items = await asService(db, async (tx) => (await tx.query<{ kind: string; title: string }>(`select kind, title from ics_items($1) order by kind, title`, [token])).rows);
    expect(items).toEqual([
      { kind: "block", title: "Deep work" },
      { kind: "task", title: "Mine, unassigned" },
    ]);
    const none = await asService(db, async (tx) => (await tx.query(`select * from ics_items('not-a-real-token-but-long-enough-xxxxxxxx')`)).rows);
    expect(none).toHaveLength(0);
  });
});

describe("writable_projects", () => {
  it("lists projects the user can write to", async () => {
    const names = await asService(db, async (tx) => (await tx.query<{ name: string }>(`select name from writable_projects($1)`, [owner.id])).rows.map((r) => r.name));
    expect(names).toEqual(["P"]);
  });
});
