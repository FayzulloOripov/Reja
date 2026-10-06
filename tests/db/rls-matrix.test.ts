import { beforeAll, describe, expect, it } from "vitest";
import { as, asService, createDb, createUser, rejects, type Db, type TestUser } from "./harness";

// RLS for every table. The owner fills one row into each table through the normal (RLS-checked)
// path; then four other people try to read and change those rows:
//   partner   — full member of the workspace: sees shared work, never the owner's private rows
//   viewer    — guest with read-only access to one project: reads it, cannot change it
//   outsider  — signed in, no membership: sees and changes nothing
//   anon      — not signed in: no table privileges at all
// The first test fails when a new table appears without being added here.

let db: Db;
let owner: TestUser, partner: TestUser, viewer: TestUser, outsider: TestUser;
const ids: Record<string, string> = {};

const TABLES = [
  "profiles", "push_subscriptions", "telegram_link_codes", "workspaces", "workspace_members", "projects", "project_members",
  "project_favorites", "invitations", "sections", "tasks", "task_assignees", "task_watchers", "task_dependencies", "labels",
  "task_labels", "checklist_items", "comments", "comment_reactions", "attachments", "time_entries", "reminders", "notifications",
  "activity_log", "goals", "key_results", "key_result_history", "notes", "habits", "habit_logs", "time_blocks", "saved_views",
  "templates", "rate_limits", "areas",
] as const;
type Table = (typeof TABLES)[number];

/** How to find the owner's fixture row(s) in each table. */
const FIXTURE: Record<Table, () => string> = {
  profiles: () => `id = '${owner.id}'`,
  push_subscriptions: () => `user_id = '${owner.id}'`,
  telegram_link_codes: () => `user_id = '${owner.id}'`,
  workspaces: () => `id = '${ids.W}'`,
  workspace_members: () => `workspace_id = '${ids.W}'`,
  projects: () => `workspace_id = '${ids.W}'`,
  project_members: () => `project_id = '${ids.P}'`,
  project_favorites: () => `user_id = '${owner.id}'`,
  invitations: () => `workspace_id = '${ids.W}'`,
  sections: () => `workspace_id = '${ids.W}'`,
  tasks: () => `workspace_id = '${ids.W}'`,
  task_assignees: () => `workspace_id = '${ids.W}'`,
  task_watchers: () => `workspace_id = '${ids.W}'`,
  task_dependencies: () => `workspace_id = '${ids.W}'`,
  labels: () => `workspace_id = '${ids.W}'`,
  task_labels: () => `workspace_id = '${ids.W}'`,
  checklist_items: () => `workspace_id = '${ids.W}'`,
  comments: () => `workspace_id = '${ids.W}'`,
  comment_reactions: () => `workspace_id = '${ids.W}'`,
  attachments: () => `workspace_id = '${ids.W}'`,
  time_entries: () => `workspace_id = '${ids.W}'`,
  reminders: () => `user_id = '${owner.id}'`,
  notifications: () => `user_id = '${owner.id}'`,
  activity_log: () => `workspace_id = '${ids.W}'`,
  goals: () => `workspace_id = '${ids.W}'`,
  key_results: () => `workspace_id = '${ids.W}'`,
  key_result_history: () => `workspace_id = '${ids.W}'`,
  notes: () => `workspace_id = '${ids.W}'`,
  habits: () => `user_id = '${owner.id}'`,
  habit_logs: () => `user_id = '${owner.id}'`,
  time_blocks: () => `user_id = '${owner.id}'`,
  saved_views: () => `workspace_id = '${ids.W}'`,
  templates: () => `workspace_id = '${ids.W}'`,
  rate_limits: () => `key = 'matrix:${owner.id}'`,
  areas: () => `workspace_id = '${ids.W}'`,
};

/** Rows only the owner may ever see (partner, viewer and outsider see none). */
const PRIVATE: Table[] = ["push_subscriptions", "telegram_link_codes", "project_favorites", "reminders", "notifications", "habits", "habit_logs", "time_blocks"];
/** Writes a project viewer must not be able to make. */
const VIEWER_READ_ONLY: Table[] = ["projects", "sections", "tasks", "checklist_items", "task_labels", "task_assignees", "notes"];

const count = (u: TestUser | null, table: Table) =>
  as(db, u, async (tx) => (await tx.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${FIXTURE[table]()}`)).rows[0].n);
const updated = (u: TestUser, table: Table, col: string) =>
  as(db, u, async (tx) => (await tx.query(`update public.${table} set ${col} = ${col} where ${FIXTURE[table]()} returning 1`)).rows.length);
const deleted = (u: TestUser, table: Table) => as(db, u, async (tx) => (await tx.query(`delete from public.${table} where ${FIXTURE[table]()} returning 1`)).rows.length);

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "m-owner@example.test", "Owner");
  partner = await createUser(db, "m-partner@example.test", "Partner");
  viewer = await createUser(db, "m-viewer@example.test", "Viewer");
  outsider = await createUser(db, "m-outsider@example.test", "Outsider");

  // the owner creates one row in each table through RLS
  await as(db, owner, async (tx) => {
    const one = async (sql: string, params: unknown[] = []) => (await tx.query<{ id: string }>(sql, params)).rows[0]?.id;
    ids.W = await one(`insert into workspaces (name, owner_id) values ('Matrix', $1) returning id`, [owner.id]);
    await tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'guest')`, [ids.W, partner.id, viewer.id]);
    ids.A = await one(`insert into areas (workspace_id, name, owner_id) values ($1, 'Area', $2) returning id`, [ids.W, owner.id]);
    ids.P = await one(`insert into projects (workspace_id, name, owner_id, area_id) values ($1, 'Project', $2, $3) returning id`, [ids.W, owner.id, ids.A]);
    await tx.query(`insert into project_members (project_id, user_id, role) values ($1, $2, 'viewer')`, [ids.P, viewer.id]);
    await tx.query(`insert into project_favorites (user_id, project_id) values ($1, $2)`, [owner.id, ids.P]);
    await tx.query(`insert into invitations (workspace_id, role, created_by, expires_at) values ($1, 'member', $2, now() + interval '7 days')`, [ids.W, owner.id]);
    ids.S = await one(`insert into sections (project_id, name) values ($1, 'Section') returning id`, [ids.P]);
    ids.T = await one(`insert into tasks (workspace_id, project_id, section_id, title, due_date) values ($1, $2, $3, 'Task', '2030-01-10') returning id`, [ids.W, ids.P, ids.S]);
    ids.T2 = await one(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'Blocker') returning id`, [ids.W, ids.P]);
    await tx.query(`insert into task_assignees (task_id, user_id) values ($1, $2)`, [ids.T, owner.id]);
    await tx.query(`insert into task_watchers (task_id, user_id) values ($1, $2) on conflict do nothing`, [ids.T, owner.id]);
    await tx.query(`insert into task_dependencies (blocker_id, blocked_id) values ($1, $2)`, [ids.T2, ids.T]);
    ids.L = await one(`insert into labels (workspace_id, name, color) values ($1, 'label', 'sky') returning id`, [ids.W]);
    await tx.query(`insert into task_labels (task_id, label_id) values ($1, $2)`, [ids.T, ids.L]);
    await tx.query(`insert into checklist_items (task_id, text) values ($1, 'Item')`, [ids.T]);
    ids.C = await one(`insert into comments (task_id, body, body_text) values ($1, '{}', 'Comment') returning id`, [ids.T]);
    await tx.query(`insert into comment_reactions (comment_id, emoji) values ($1, '👍')`, [ids.C]);
    await tx.query(`insert into attachments (task_id, storage_path, name, size, mime) values ($1, $2, 'a.txt', 1, 'text/plain')`, [ids.T, `${ids.W}/${ids.T}/a.txt`]);
    await tx.query(`insert into time_entries (task_id, minutes) values ($1, 25)`, [ids.T]);
    await tx.query(`insert into reminders (user_id, task_id, remind_at, offset_rule) values ($1, $2, '2030-01-10T04:00:00Z', 'custom')`, [owner.id, ids.T]);
    ids.G = await one(`insert into goals (workspace_id, title, owner_id) values ($1, 'Goal', $2) returning id`, [ids.W, owner.id]);
    ids.K = await one(`insert into key_results (goal_id, title, target) values ($1, 'KR', 10) returning id`, [ids.G]);
    await tx.query(`insert into key_result_history (key_result_id, value) values ($1, 3)`, [ids.K]);
    await tx.query(`insert into notes (workspace_id, project_id, title) values ($1, $2, 'Note')`, [ids.W, ids.P]);
    ids.H = await one(`insert into habits (user_id, name) values ($1, 'Habit') returning id`, [owner.id]);
    await tx.query(`insert into habit_logs (habit_id, user_id, date) values ($1, $2, '2030-01-01')`, [ids.H, owner.id]);
    await tx.query(`insert into time_blocks (user_id, date, start_at, end_at, title) values ($1, '2030-01-10', '2030-01-10T05:00:00Z', '2030-01-10T06:00:00Z', 'Block')`, [owner.id]);
    await tx.query(`insert into saved_views (workspace_id, user_id, name) values ($1, $2, 'Mine')`, [ids.W, owner.id]);
    await tx.query(`insert into templates (workspace_id, kind, name, data) values ($1, 'project', 'Tpl', '{}')`, [ids.W]);
    await tx.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [owner.id, `https://push.example/${owner.id}`]);
  });
  // rows that only the server writes
  await asService(db, async (tx) => {
    await tx.query(`insert into notifications (user_id, type, title) values ($1, 'reminder', 'Hello')`, [owner.id]);
    await tx.query(`insert into telegram_link_codes (user_id, code, expires_at) values ($1, $2, now() + interval '15 minutes')`, [owner.id, `M${owner.id.slice(0, 8)}`]);
    await tx.query(`insert into rate_limits (key, window_start, count) values ($1, now(), 1)`, [`matrix:${owner.id}`]);
  });
});

describe("RLS matrix (every table)", () => {
  it("every public table has RLS enabled and is listed in this test", async () => {
    const rows = await asService(db, async (tx) =>
      (await tx.query<{ name: string; rls: boolean }>(
        `select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' order by 1`,
      )).rows,
    );
    expect(rows.filter((r) => !r.rls).map((r) => r.name)).toEqual([]);
    expect(rows.map((r) => r.name).sort()).toEqual([...TABLES].sort());
  });

  it("the owner can read their row in every table (rate_limits is server-only)", async () => {
    for (const table of TABLES) {
      if (table === "rate_limits") continue;
      expect(await count(owner, table), table).toBeGreaterThan(0);
    }
  });

  it("signed-out visitors have no access to any table", async () => {
    for (const table of TABLES) {
      const msg = await rejects(count(null, table));
      expect(msg, table).toMatch(/permission denied/);
    }
  });

  it("an outsider sees nothing and can change nothing in any table", async () => {
    for (const table of TABLES) {
      if (table === "rate_limits") {
        expect(await rejects(count(outsider, table))).toMatch(/permission denied/);
        continue;
      }
      const visible = await count(outsider, table);
      // a profile is visible only to people who share a workspace with it
      expect(visible, `${table} visible to outsider`).toBe(0);
    }
    for (const table of ["workspaces", "projects", "sections", "tasks", "labels", "checklist_items", "comments", "goals", "key_results", "notes", "saved_views", "templates", "areas", "invitations", "attachments", "time_entries", "habits", "time_blocks", "reminders"] as Table[]) {
      expect(await updated(outsider, table, "created_at"), `${table} update by outsider`).toBe(0);
      expect(await deleted(outsider, table), `${table} delete by outsider`).toBe(0);
    }
    expect(await rejects(as(db, outsider, (tx) => tx.query(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'x')`, [ids.W, ids.P])))).toMatch(/row-level security|permission/);
    expect(await rejects(as(db, outsider, (tx) => tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ids.W, outsider.id])))).toMatch(/row-level security|permission/);
    expect(await rejects(as(db, outsider, (tx) => tx.query(`insert into comments (task_id, body, body_text) values ($1, '{}', 'x')`, [ids.T])))).toMatch(/row-level security|permission/);
  });

  it("a full member (partner) sees shared work but never the owner's private rows", async () => {
    for (const table of PRIVATE) expect(await count(partner, table), `${table} visible to partner`).toBe(0);
    for (const table of ["projects", "tasks", "comments", "notes", "goals", "areas", "labels", "time_entries", "activity_log"] as Table[]) {
      expect(await count(partner, table), `${table} hidden from partner`).toBeGreaterThan(0);
    }
    // a personal saved view stays personal
    expect(await count(partner, "saved_views")).toBe(0);
    for (const table of PRIVATE) {
      if (table === "telegram_link_codes") continue; // no update grant at all
      expect(await deleted(partner, table), `${table} delete by partner`).toBe(0);
    }
  });

  it("a project viewer reads the project but cannot change it", async () => {
    for (const table of ["projects", "sections", "tasks", "checklist_items", "comments", "notes"] as Table[]) {
      expect(await count(viewer, table), `${table} hidden from viewer`).toBeGreaterThan(0);
    }
    for (const table of VIEWER_READ_ONLY) {
      if (table === "task_labels" || table === "task_assignees") continue; // link tables have no updatable columns
      expect(await updated(viewer, table, "created_at"), `${table} update by viewer`).toBe(0);
    }
    expect(await rejects(as(db, viewer, (tx) => tx.query(`insert into tasks (workspace_id, project_id, title) values ($1, $2, 'x')`, [ids.W, ids.P])))).toMatch(/row-level security|permission/);
    expect(await rejects(as(db, viewer, (tx) => tx.query(`insert into task_assignees (task_id, user_id) values ($1, $2)`, [ids.T, viewer.id])))).toMatch(/row-level security|permission/);
    expect(await rejects(as(db, viewer, (tx) => tx.query(`insert into sections (project_id, name) values ($1, 'x')`, [ids.P])))).toMatch(/row-level security|permission/);
    // and sees nothing of the owner's private rows or other projects
    for (const table of PRIVATE) expect(await count(viewer, table), `${table} visible to viewer`).toBe(0);
    expect(await count(viewer, "invitations")).toBe(0);
  });
});
