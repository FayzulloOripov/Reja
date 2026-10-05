import { beforeAll, describe, expect, it } from "vitest";
import { as, asService, createDb, createUser, type Db, type TestUser } from "./harness";

let db: Db;
let alice: TestUser, bob: TestUser;
let W: string, P: string;

beforeAll(async () => {
  db = await createDb();
  alice = await createUser(db, "alice@example.test", "Alice");
  bob = await createUser(db, "bob@example.test", "Bob");
  await as(db, alice, async (tx) => {
    W = (await tx.query<{ id: string }>(`insert into workspaces (name, owner_id) values ('Team', $1) returning id`, [alice.id])).rows[0].id;
    P = (await tx.query<{ id: string }>(`insert into projects (workspace_id, name, owner_id) values ($1, 'Launch', $2) returning id`, [W, alice.id])).rows[0].id;
  });
});

describe("recurring tasks", () => {
  it("allow only one live occurrence generated from a completed task", async () => {
    const parent = await as(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title, recurrence) values ($1, $2, 'Daily', 'FREQ=DAILY') returning id`, [W, P])).rows[0].id,
    );
    await as(db, alice, (tx) => tx.query(`insert into tasks (workspace_id, project_id, title, recurrence, recurrence_parent_id) values ($1, $2, 'Daily', 'FREQ=DAILY', $3)`, [W, P, parent]));
    await expect(
      as(db, alice, (tx) => tx.query(`insert into tasks (workspace_id, project_id, title, recurrence, recurrence_parent_id) values ($1, $2, 'Daily', 'FREQ=DAILY', $3)`, [W, P, parent])),
    ).rejects.toThrow(/duplicate key|unique/);
  });

  it("allow a new occurrence once the previous one was deleted (reopened and completed again)", async () => {
    const parent = await as(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title, recurrence) values ($1, $2, 'Weekly', 'FREQ=WEEKLY') returning id`, [W, P])).rows[0].id,
    );
    const first = await as(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title, recurrence_parent_id) values ($1, $2, 'Weekly', $3) returning id`, [W, P, parent])).rows[0].id,
    );
    await as(db, alice, (tx) => tx.query(`update tasks set deleted_at = now() where id = $1`, [first]));
    await as(db, alice, (tx) => tx.query(`insert into tasks (workspace_id, project_id, title, recurrence_parent_id) values ($1, $2, 'Weekly', $3)`, [W, P, parent]));
  });
});

describe("reminder timing", () => {
  it("defaults new users to 15 minutes before", async () => {
    const r = await asService(db, (tx) => tx.query<{ default_reminder: string }>(`select default_reminder from profiles where id = $1`, [bob.id]));
    expect(r.rows[0].default_reminder).toBe("15m");
  });

  it("reminds all-day tasks at 09:00 local time, and 1 day before at 09:00 the day before", async () => {
    const q = (rule: string, dueAt: string | null) =>
      asService(db, async (tx) => (await tx.query<{ at: Date }>(`select public.reminder_moment('2030-03-14', $1::timestamptz, 'Asia/Tashkent', $2) as at`, [dueAt, rule])).rows[0].at.toISOString());
    expect(await q("15m", null)).toBe("2030-03-14T04:00:00.000Z");
    expect(await q("1h", null)).toBe("2030-03-14T04:00:00.000Z");
    expect(await q("1d", null)).toBe("2030-03-13T04:00:00.000Z");
    expect(await q("15m", "2030-03-14T10:30:00Z")).toBe("2030-03-14T10:15:00.000Z");
  });

  it("creates the automatic reminder 15 minutes before a timed task", async () => {
    const id = await as(db, bob, async (tx) =>
      (await tx.query<{ id: string }>(`insert into tasks (workspace_id, title, due_date, due_at) values ($1, 'Meet', '2030-03-14', '2030-03-14T10:00:00Z') returning id`, [bob.personalWorkspace])).rows[0].id,
    );
    const r = await asService(db, (tx) => tx.query<{ remind_at: Date }>(`select remind_at from reminders where task_id = $1`, [id]));
    expect(r.rows[0].remind_at.toISOString()).toBe("2030-03-14T09:45:00.000Z");
  });
});

describe("focus sessions", () => {
  it("can be stored without a task, and only their owner sees them", async () => {
    await as(db, alice, (tx) => tx.query(`insert into time_entries (workspace_id, user_id, minutes, source) values ($1, $2, 25, 'focus')`, [alice.personalWorkspace, alice.id]));
    const mine = await as(db, alice, (tx) => tx.query(`select id from time_entries where source = 'focus' and task_id is null`));
    expect(mine.rows).toHaveLength(1);
    const theirs = await as(db, bob, (tx) => tx.query(`select id from time_entries where task_id is null`));
    expect(theirs.rows).toHaveLength(0);
  });

  it("cannot be logged into a workspace the user is not a member of", async () => {
    await expect(
      as(db, bob, (tx) => tx.query(`insert into time_entries (workspace_id, user_id, minutes, source) values ($1, $2, 25, 'focus')`, [W, bob.id])),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("project health note", () => {
  it("is stored with a manual health", async () => {
    await as(db, alice, (tx) => tx.query(`update projects set health_manual = true, health = 'at_risk', health_note = 'Waiting for the client' where id = $1`, [P]));
    const r = await as(db, alice, (tx) => tx.query<{ health_note: string }>(`select health_note from projects where id = $1`, [P]));
    expect(r.rows[0].health_note).toBe("Waiting for the client");
  });
});
