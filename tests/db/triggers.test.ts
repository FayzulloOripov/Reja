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
    await tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [W, bob.id]);
  });
});

const futureDate = "2030-03-14"; // Thursday, far enough in the future to be "pending"

async function remindersFor(task: string) {
  return asService(db, async (tx) =>
    (await tx.query<{ user_id: string; remind_at: Date; status: string; is_auto: boolean }>(
      `select user_id, remind_at, status, is_auto from reminders where task_id = $1 order by user_id`,
      [task],
    )).rows,
  );
}

describe("automatic reminders", () => {
  it("creates a reminder at 09:00 local time for all-day tasks (Tashkent = UTC+5)", async () => {
    const id = await as(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title, due_date) values ($1, $2, 'Report', $3) returning id`, [W, P, futureDate])).rows[0].id,
    );
    const r = await remindersFor(id);
    expect(r).toHaveLength(1);
    expect(r[0].user_id).toBe(alice.id);
    expect(r[0].remind_at.toISOString()).toBe("2030-03-14T04:00:00.000Z");
    expect(r[0].status).toBe("pending");
  });

  it("uses the exact due time and the user's offset rule", async () => {
    await as(db, alice, (tx) => tx.query(`update profiles set default_reminder = '1h' where id = $1`, [alice.id]));
    const id = await as(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(
        `insert into tasks (workspace_id, project_id, title, due_date, due_at) values ($1, $2, 'Call', $3, '2030-03-14T10:30:00Z') returning id`,
        [W, P, futureDate],
      )).rows[0].id,
    );
    expect((await remindersFor(id))[0].remind_at.toISOString()).toBe("2030-03-14T09:30:00.000Z");
    await as(db, alice, (tx) => tx.query(`update profiles set default_reminder = 'at_due' where id = $1`, [alice.id]));
  });

  it("moves the reminder to the assignee and follows due-date changes", async () => {
    const id = await as(db, alice, async (tx) => {
      const tid = (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title, due_date) values ($1, $2, 'Assign me', $3) returning id`, [W, P, futureDate])).rows[0].id;
      await tx.query(`insert into task_assignees (task_id, user_id) values ($1, $2)`, [tid, bob.id]);
      return tid;
    });
    let r = await remindersFor(id);
    expect(r.map((x) => x.user_id)).toEqual([bob.id]);

    await as(db, alice, (tx) => tx.query(`update tasks set due_date = '2030-03-20' where id = $1`, [id]));
    r = await remindersFor(id);
    expect(r[0].remind_at.toISOString()).toBe("2030-03-20T04:00:00.000Z");
  });

  it("dismisses pending reminders when the task is completed", async () => {
    const id = await as(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title, due_date) values ($1, $2, 'Finish', $3) returning id`, [W, P, futureDate])).rows[0].id,
    );
    await as(db, alice, (tx) => tx.query(`update tasks set status = 'done' where id = $1`, [id]));
    expect((await remindersFor(id))[0].status).toBe("dismissed");
    const completed = await as(db, alice, async (tx) =>
      (await tx.query<{ completed_at: Date | null }>(`select completed_at from tasks where id = $1`, [id])).rows[0].completed_at,
    );
    expect(completed).toBeInstanceOf(Date);
  });

  it("respects a user who turned default reminders off", async () => {
    await as(db, bob, (tx) => tx.query(`update profiles set default_reminder = 'none' where id = $1`, [bob.id]));
    const id = await as(db, bob, async (tx) =>
      (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title, due_date) values ($1, $2, 'Quiet', $3) returning id`, [W, P, futureDate])).rows[0].id,
    );
    expect(await remindersFor(id)).toHaveLength(0);
    await as(db, bob, (tx) => tx.query(`update profiles set default_reminder = 'at_due' where id = $1`, [bob.id]));
  });
});

describe("scheduler claims are idempotent", () => {
  it("returns each due reminder to exactly one caller", async () => {
    await as(db, alice, (tx) =>
      tx.query(`insert into reminders (title, remind_at, offset_rule) values ('Standalone', now() - interval '1 minute', 'custom')`),
    );
    const first = await asService(db, async (tx) => (await tx.query(`select * from claim_due_reminders(100)`)).rows);
    const second = await asService(db, async (tx) => (await tx.query(`select * from claim_due_reminders(100)`)).rows);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(second).toHaveLength(0);
  });

  it("claims the daily digest once per user per local date", async () => {
    const claim = () =>
      asService(db, async (tx) =>
        (await tx.query<{ ok: boolean }>(`select claim_daily_slot($1, 'digest', '2026-10-05') as ok`, [alice.id])).rows[0].ok,
      );
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    const nextDay = await asService(db, async (tx) =>
      (await tx.query<{ ok: boolean }>(`select claim_daily_slot($1, 'digest', '2026-10-06') as ok`, [alice.id])).rows[0].ok,
    );
    expect(nextDay).toBe(true);
  });

  it("rate limits within a window", async () => {
    const hit = () =>
      asService(db, async (tx) => (await tx.query<{ ok: boolean }>(`select hit_rate_limit('tg:1', 2, 60) as ok`)).rows[0].ok);
    expect([await hit(), await hit(), await hit()]).toEqual([true, true, false]);
  });
});

describe("notifications and activity", () => {
  it("notifies an assignee but not the person who assigned themselves", async () => {
    const id = await as(db, alice, async (tx) => {
      const tid = (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'Design review') returning id`, [W, P])).rows[0].id;
      await tx.query(`insert into task_assignees (task_id, user_id) values ($1, $2), ($1, $3)`, [tid, bob.id, alice.id]);
      return tid;
    });
    const bobs = await as(db, bob, async (tx) => (await tx.query<{ type: string; url: string }>(`select type, url from notifications where task_id = $1`, [id])).rows);
    const alices = await as(db, alice, async (tx) => (await tx.query(`select 1 from notifications where task_id = $1`, [id])).rows);
    expect(bobs).toEqual([{ type: "assigned", url: `/tasks/${id}` }]);
    expect(alices).toHaveLength(0);
  });

  it("sends mentions and comment notifications to the audience", async () => {
    const id = await as(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'Copy') returning id`, [W, P])).rows[0].id,
    );
    await as(db, bob, (tx) =>
      tx.query(`insert into comments (task_id, body, body_text, mentions) values ($1, '{}', 'please check', $2)`, [id, [alice.id]]),
    );
    const types = await as(db, alice, async (tx) =>
      (await tx.query<{ type: string }>(`select type from notifications where task_id = $1`, [id])).rows.map((r) => r.type),
    );
    expect(types).toEqual(["mentioned"]);
    // the commenter now watches the task
    const watching = await asService(db, async (tx) =>
      (await tx.query(`select 1 from task_watchers where task_id = $1 and user_id = $2`, [id, bob.id])).rows.length,
    );
    expect(watching).toBe(1);
  });

  it("records a diff for task updates and skips position-only changes", async () => {
    const id = await as(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'Diff me') returning id`, [W, P])).rows[0].id,
    );
    await as(db, alice, async (tx) => {
      await tx.query(`update tasks set position = 5 where id = $1`, [id]);
      await tx.query(`update tasks set priority = 'urgent', status = 'done' where id = $1`, [id]);
    });
    const log = await as(db, alice, async (tx) =>
      (await tx.query<{ action: string; diff: Record<string, unknown> }>(`select action, diff from activity_log where task_id = $1 order by created_at, action`, [id])).rows,
    );
    expect(log.map((l) => l.action).sort()).toEqual(["completed", "created"]);
    const completed = log.find((l) => l.action === "completed")!;
    expect(completed.diff.priority).toEqual(["none", "urgent"]);
  });

  it("keeps subtasks in the parent's project when the parent moves", async () => {
    const [parent, child, other] = await as(db, alice, async (tx) => {
      const other = (await tx.query<{ id: string }>(`insert into projects (workspace_id, name, owner_id) values ($1, 'Other', $2) returning id`, [W, alice.id])).rows[0].id;
      const p = (await tx.query<{ id: string }>(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'Parent') returning id`, [W, P])).rows[0].id;
      const c = (await tx.query<{ id: string }>(`insert into tasks (workspace_id, parent_id, title) values ($1, $2, 'Child') returning id`, [W, p])).rows[0].id;
      await tx.query(`update tasks set project_id = $1 where id = $2`, [other, p]);
      return [p, c, other];
    });
    const childProject = await asService(db, async (tx) =>
      (await tx.query<{ project_id: string }>(`select project_id from tasks where id = $1`, [child])).rows[0].project_id,
    );
    expect(parent).toBeTruthy();
    expect(childProject).toBe(other);
  });
});

describe("account deletion", () => {
  it("deletes the personal workspace and hands a shared one to another member", async () => {
    const carol = await createUser(db, "carol@example.test", "Carol");
    const dave = await createUser(db, "dave@example.test", "Dave");
    const shared = await as(db, carol, async (tx) => {
      const id = (await tx.query<{ id: string }>(`insert into workspaces (name, owner_id) values ('Shared', $1) returning id`, [carol.id])).rows[0].id;
      await tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [id, dave.id]);
      return id;
    });
    await db.query(`delete from auth.users where id = $1`, [carol.id]); // as the auth service does
    const rows = await asService(db, async (tx) => (await tx.query<{ id: string; owner_id: string }>(`select id, owner_id from workspaces where id in ($1, $2)`, [shared, carol.personalWorkspace])).rows);
    expect(rows).toEqual([{ id: shared, owner_id: dave.id }]);
    const role = await asService(db, async (tx) => (await tx.query<{ role: string }>(`select role from workspace_members where workspace_id = $1 and user_id = $2`, [shared, dave.id])).rows[0].role);
    expect(role).toBe("owner");
  });
});
