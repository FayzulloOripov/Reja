import { beforeAll, describe, expect, it } from "vitest";
import { as, asService, createDb, createUser, plainEmail, rejects, type Db, type TestUser } from "./harness";

/**
 * Sharing model under test:
 *   owner  — owns workspace W with projects P1, P2 (workspace-visible) and PRIV (private)
 *   member — full member of W (business partner)
 *   guest  — project member of P1 only (consultant)
 *   viewer — viewer of P2 only (manager with read-only access)
 *   outsider — no access
 */
let db: Db;
let owner: TestUser, member: TestUser, guest: TestUser, viewer: TestUser, outsider: TestUser;
let W: string, P1: string, P2: string, PRIV: string;
let t1: string, t2: string, tPriv: string, ownerInbox: string;

async function invite(by: TestUser, ws: string, project: string | null, role: string, email: string | null) {
  return as(db, by, async (tx) => {
    const { rows } = await tx.query<{ token: string }>(
      `insert into invitations (workspace_id, project_id, role, email, created_by)
       values ($1, $2, $3, $4, $5) returning token`,
      [ws, project, role, email, by.id],
    );
    return rows[0].token;
  });
}

async function accept(user: TestUser, token: string) {
  return as(db, user, (tx) => tx.query(`select accept_invitation($1)`, [token]));
}

async function count(user: TestUser, sql: string, params: unknown[] = []) {
  return as(db, user, async (tx) => (await tx.query(sql, params)).rows.length);
}

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@example.test", "Owner");
  member = await createUser(db, "partner@example.test", "Partner");
  guest = await createUser(db, "consultant@example.test", "Consultant");
  viewer = await createUser(db, "manager@example.test", "Manager");
  outsider = await createUser(db, "outsider@example.test", "Outsider");

  await as(db, owner, async (tx) => {
    W = (await tx.query<{ id: string }>(`insert into workspaces (name, owner_id) values ('Agency', $1) returning id`, [owner.id])).rows[0].id;
    const mk = async (name: string, vis = "workspace") =>
      (await tx.query<{ id: string }>(
        `insert into projects (workspace_id, name, visibility, owner_id) values ($1, $2, $3, $4) returning id`,
        [W, name, vis, owner.id],
      )).rows[0].id;
    P1 = await mk("Client A");
    P2 = await mk("Client B");
    PRIV = await mk("Personal", "private");
    const task = async (project: string | null, title: string) =>
      (await tx.query<{ id: string }>(
        `insert into tasks (workspace_id, project_id, title) values ($1, $2, $3) returning id`,
        [W, project, title],
      )).rows[0].id;
    t1 = await task(P1, "P1 task");
    t2 = await task(P2, "P2 task");
    tPriv = await task(PRIV, "Private task");
    ownerInbox = await task(null, "Owner inbox");
  });

  await accept(member, await invite(owner, W, null, "member", member.email));
  await accept(guest, await invite(owner, W, P1, "member", null));
  await accept(viewer, await invite(owner, W, P2, "viewer", viewer.email));
});

describe("workspace membership", () => {
  it("creates a personal workspace and owner membership on sign-up", async () => {
    const rows = await as(db, owner, async (tx) =>
      (await tx.query<{ role: string; is_personal: boolean }>(
        `select m.role, w.is_personal from workspace_members m join workspaces w on w.id = m.workspace_id
         where m.user_id = $1 order by w.is_personal desc`,
        [owner.id],
      )).rows,
    );
    expect(rows).toEqual([
      { role: "owner", is_personal: true },
      { role: "owner", is_personal: false },
    ]);
  });

  it("gives accepted invitees the right roles", async () => {
    const roles = await asService(db, async (tx) =>
      (await tx.query<{ email: string; role: string }>(
        `select p.email, m.role from workspace_members m join profiles p on p.id = m.user_id
         where m.workspace_id = $1 order by p.email`,
        [W],
      )).rows.map((r) => ({ ...r, email: plainEmail(r.email) })),
    );
    expect(roles).toEqual([
      { email: "consultant@example.test", role: "guest" },
      { email: "manager@example.test", role: "guest" },
      { email: "owner@example.test", role: "owner" },
      { email: "partner@example.test", role: "member" },
    ]);
  });

  it("rejects an email invitation accepted by a different address", async () => {
    const token = await invite(owner, W, null, "member", "someone-else@example.test");
    expect(await rejects(accept(outsider, token))).toMatch(/invitation_wrong_email/);
  });

  it("does not let an admin remove the owner", async () => {
    await asService(db, (tx) =>
      tx.query(`update workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2`, [W, member.id]),
    );
    expect(
      await rejects(as(db, member, (tx) => tx.query(`delete from workspace_members where workspace_id = $1 and user_id = $2`, [W, owner.id]))),
    ).toMatch(/owner/);
    await asService(db, (tx) =>
      tx.query(`update workspace_members set role = 'member' where workspace_id = $1 and user_id = $2`, [W, member.id]),
    );
  });

  it("hides the workspace entirely from outsiders", async () => {
    expect(await count(outsider, `select 1 from workspaces where id = $1`, [W])).toBe(0);
    expect(await count(outsider, `select 1 from projects where workspace_id = $1`, [W])).toBe(0);
    expect(await count(outsider, `select 1 from tasks where workspace_id = $1`, [W])).toBe(0);
    expect(await count(outsider, `select 1 from workspace_members where workspace_id = $1`, [W])).toBe(0);
  });
});

describe("full member (partner)", () => {
  it("sees workspace projects but not private ones", async () => {
    const names = await as(db, member, async (tx) =>
      (await tx.query<{ name: string }>(`select name from projects where workspace_id = $1 order by name`, [W])).rows.map((r) => r.name),
    );
    expect(names).toEqual(["Client A", "Client B"]);
    expect(await count(member, `select 1 from tasks where id = $1`, [tPriv])).toBe(0);
  });

  it("never sees someone else's inbox", async () => {
    expect(await count(member, `select 1 from tasks where id = $1`, [ownerInbox])).toBe(0);
  });

  it("can create and edit tasks in shared projects", async () => {
    const n = await as(db, member, async (tx) => {
      await tx.query(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'From partner')`, [W, P2]);
      return (await tx.query(`update tasks set priority = 'high' where id = $1 returning id`, [t1])).rows.length;
    });
    expect(n).toBe(1);
  });
});

describe("project guest (consultant)", () => {
  it("reads only the project shared with them", async () => {
    const names = await as(db, guest, async (tx) =>
      (await tx.query<{ name: string }>(`select name from projects`)).rows.map((r) => r.name),
    );
    expect(names).toEqual(["Client A"]);
    expect(await count(guest, `select 1 from tasks where id = $1`, [t1])).toBe(1);
    expect(await count(guest, `select 1 from tasks where id = any($1)`, [[t2, tPriv, ownerInbox]])).toBe(0);
  });

  it("cannot read sections, notes, goals or activity outside their project", async () => {
    await as(db, owner, async (tx) => {
      await tx.query(`insert into sections (project_id, name) values ($1, 'Todo')`, [P2]);
      await tx.query(`insert into notes (project_id, title) values ($1, 'Secret plan')`, [P2]);
      await tx.query(`insert into goals (workspace_id, title) values ($1, 'Workspace goal')`, [W]);
      await tx.query(`insert into comments (task_id, body, body_text) values ($1, '{}', 'hidden')`, [t2]);
    });
    expect(await count(guest, `select 1 from sections where project_id = $1`, [P2])).toBe(0);
    expect(await count(guest, `select 1 from notes where project_id = $1`, [P2])).toBe(0);
    expect(await count(guest, `select 1 from goals where workspace_id = $1`, [W])).toBe(0);
    expect(await count(guest, `select 1 from comments where task_id = $1`, [t2])).toBe(0);
    expect(await count(guest, `select 1 from activity_log where project_id = $1`, [P2])).toBe(0);
    expect(await count(guest, `select 1 from activity_log where project_id = $1`, [P1])).toBeGreaterThan(0);
  });

  it("cannot write outside their project", async () => {
    expect(
      await rejects(as(db, guest, (tx) => tx.query(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'x')`, [W, P2]))),
    ).toMatch(/row-level security/);
    const updated = await as(db, guest, async (tx) =>
      (await tx.query(`update tasks set title = 'hacked' where id = any($1) returning id`, [[t2, tPriv, ownerInbox]])).rows.length,
    );
    expect(updated).toBe(0);
    expect(
      await rejects(as(db, guest, (tx) => tx.query(`insert into project_members (project_id, user_id, role) values ($1, $2, 'manager')`, [P2, guest.id]))),
    ).toMatch(/row-level security/);
    expect(
      await rejects(as(db, guest, (tx) => tx.query(`insert into checklist_items (task_id, text) values ($1, 'x')`, [t2]))),
    ).toMatch(/row-level security|Task not found/);
    expect(
      await rejects(as(db, guest, (tx) => tx.query(`insert into comments (task_id, body) values ($1, '{}')`, [t2]))),
    ).toMatch(/row-level security|Task not found/);
  });

  it("cannot move a task out of their project into one they cannot write", async () => {
    expect(
      await rejects(as(db, guest, (tx) => tx.query(`update tasks set project_id = $1 where id = $2`, [P2, t1]))),
    ).toMatch(/row-level security/);
  });

  it("cannot create projects in the workspace", async () => {
    expect(
      await rejects(as(db, guest, (tx) => tx.query(`insert into projects (workspace_id, name, owner_id) values ($1, 'Mine', $2)`, [W, guest.id]))),
    ).toMatch(/row-level security/);
  });

  it("can work inside their project", async () => {
    const n = await as(db, guest, async (tx) => {
      await tx.query(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'Consultant task')`, [W, P1]);
      await tx.query(`insert into comments (task_id, body, body_text) values ($1, '{}', 'hello')`, [t1]);
      return (await tx.query(`update tasks set status = 'in_progress' where id = $1 returning id`, [t1])).rows.length;
    });
    expect(n).toBe(1);
  });

  it("sees people who can work in their project, but not other guests", async () => {
    const emails = await as(db, guest, async (tx) =>
      (await tx.query<{ email: string }>(`select email from profiles order by email`)).rows.map((r) => plainEmail(r.email)),
    );
    // full members can open every workspace project, so they are visible; the other guest is not
    expect(emails).toEqual(["consultant@example.test", "owner@example.test", "partner@example.test"]);
  });
});

describe("viewer (read-only manager)", () => {
  it("can read the project", async () => {
    expect(await count(viewer, `select 1 from tasks where id = $1`, [t2])).toBe(1);
    expect(await count(viewer, `select 1 from projects where id = $1`, [P1])).toBe(0);
  });

  it("cannot write anything", async () => {
    const updated = await as(db, viewer, async (tx) =>
      (await tx.query(`update tasks set title = 'changed' where id = $1 returning id`, [t2])).rows.length,
    );
    expect(updated).toBe(0);
    const deleted = await as(db, viewer, async (tx) => (await tx.query(`delete from tasks where id = $1 returning id`, [t2])).rows.length);
    expect(deleted).toBe(0);
    expect(
      await rejects(as(db, viewer, (tx) => tx.query(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'x')`, [W, P2]))),
    ).toMatch(/row-level security/);
    expect(
      await rejects(as(db, viewer, (tx) => tx.query(`insert into comments (task_id, body) values ($1, '{}')`, [t2]))),
    ).toMatch(/row-level security/);
    expect(
      await rejects(as(db, viewer, (tx) => tx.query(`insert into checklist_items (task_id, text) values ($1, 'x')`, [t2]))),
    ).toMatch(/row-level security/);
    expect(
      await rejects(as(db, viewer, (tx) => tx.query(`insert into sections (project_id, name) values ($1, 'x')`, [P2]))),
    ).toMatch(/row-level security/);
    const projUpdated = await as(db, viewer, async (tx) =>
      (await tx.query(`update projects set name = 'renamed' where id = $1 returning id`, [P2])).rows.length,
    );
    expect(projUpdated).toBe(0);
  });

  it("can still watch a task to follow it", async () => {
    const n = await as(db, viewer, async (tx) =>
      (await tx.query(`insert into task_watchers (task_id, user_id) values ($1, $2) returning task_id`, [t2, viewer.id])).rows.length,
    );
    expect(n).toBe(1);
  });
});

describe("private data", () => {
  it("keeps habits, time blocks and reminders private to the owner", async () => {
    await as(db, owner, async (tx) => {
      const h = (await tx.query<{ id: string }>(`insert into habits (name) values ('Gym') returning id`)).rows[0].id;
      await tx.query(`insert into habit_logs (habit_id, date) values ($1, '2026-10-05')`, [h]);
      await tx.query(
        `insert into time_blocks (date, start_at, end_at, title) values ('2026-10-05', '2026-10-05T04:00Z', '2026-10-05T05:00Z', 'Deep work')`,
      );
    });
    for (const u of [member, guest, viewer, outsider]) {
      expect(await count(u, `select 1 from habits`)).toBe(0);
      expect(await count(u, `select 1 from habit_logs`)).toBe(0);
      expect(await count(u, `select 1 from time_blocks`)).toBe(0);
    }
  });

  it("does not let users forge server-managed profile columns", async () => {
    expect(
      await rejects(as(db, owner, (tx) => tx.query(`update profiles set telegram_chat_id = 42 where id = $1`, [owner.id]))),
    ).toMatch(/permission denied/);
    expect(
      await rejects(as(db, owner, (tx) => tx.query(`update profiles set ics_token = 'guessable' where id = $1`, [owner.id]))),
    ).toMatch(/permission denied/);
    const ok = await as(db, owner, async (tx) =>
      (await tx.query(`update profiles set timezone = 'Asia/Tashkent', name = 'Owner' where id = $1 returning id`, [owner.id])).rows.length,
    );
    expect(ok).toBe(1);
  });

  it("does not let users create notifications or activity directly", async () => {
    expect(
      await rejects(
        as(db, member, (tx) => tx.query(`insert into notifications (user_id, type, title) values ($1, 'assigned', 'spam')`, [owner.id])),
      ),
    ).toMatch(/permission denied/);
    expect(
      await rejects(
        as(db, member, (tx) => tx.query(`insert into activity_log (workspace_id, entity_type, action) values ($1, 'x', 'y')`, [W])),
      ),
    ).toMatch(/permission denied/);
  });

  it("keeps scheduler RPCs away from signed-in users", async () => {
    expect(await rejects(as(db, owner, (tx) => tx.query(`select claim_due_reminders(10)`)))).toMatch(/permission denied/);
    expect(await rejects(as(db, owner, (tx) => tx.query(`select link_telegram('X', 1, 'u')`)))).toMatch(/permission denied/);
  });

  it("forces created_by to the signed-in user", async () => {
    const createdBy = await as(db, member, async (tx) =>
      (await tx.query<{ created_by: string }>(
        `insert into tasks (workspace_id, project_id, title, created_by) values ($1, $2, 'spoof', $3) returning created_by`,
        [W, P1, owner.id],
      )).rows[0].created_by,
    );
    expect(createdBy).toBe(member.id);
  });
});
