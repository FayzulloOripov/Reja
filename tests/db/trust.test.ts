import { beforeAll, describe, expect, it } from "vitest";
import { as, asService, createDb, createUser, rejects, type Db, type TestUser } from "./harness";

// Phase 8: the device list (sign out other devices), the admins' audit log, the weekly backup slot.

let db: Db;
let owner: TestUser, member: TestUser, outsider: TestUser;
let W: string;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "tr-owner@example.test", "Owner");
  member = await createUser(db, "tr-member@example.test", "Member");
  outsider = await createUser(db, "tr-outsider@example.test", "Outsider");
  W = await as(db, owner, async (tx) => (await tx.query<{ id: string }>(`insert into workspaces (name, owner_id) values ('Trust', $1) returning id`, [owner.id])).rows[0].id);
});

describe("sessions and devices", () => {
  it("lists my devices, ends another one, never the current one or someone else's", async () => {
    // sessions are written by Supabase Auth itself; the test writes them as the database owner
    const ins = async (u: string, ua: string) => (await db.query<{ id: string }>(`insert into auth.sessions (id, user_id, user_agent, ip, created_at, updated_at) values (gen_random_uuid(), $1, $2, '10.0.0.1', now(), now()) returning id`, [u, ua])).rows[0].id;
    const ids = { here: await ins(owner.id, "Chrome on Mac"), phone: await ins(owner.id, "Safari on iPhone"), laptop: await ins(owner.id, "Firefox on Linux"), theirs: await ins(member.id, "Edge") };
    const me = { ...owner, sessionId: ids.here };
    const list = await as(db, me, async (tx) => (await tx.query<{ id: string; current: boolean; user_agent: string }>(`select id, current, user_agent from my_sessions()`)).rows);
    expect(list).toHaveLength(3);
    expect(list.find((s) => s.current)?.id).toBe(ids.here);
    expect(await as(db, me, async (tx) => (await tx.query(`select end_session($1) as ok`, [ids.here])).rows[0].ok)).toBe(false);
    expect(await as(db, me, async (tx) => (await tx.query(`select end_session($1) as ok`, [ids.theirs])).rows[0].ok)).toBe(false);
    expect(await as(db, me, async (tx) => (await tx.query(`select end_session($1) as ok`, [ids.phone])).rows[0].ok)).toBe(true);
    expect(await as(db, me, async (tx) => (await tx.query(`select end_other_sessions() as n`)).rows[0].n)).toBe(1);
    expect(await as(db, me, async (tx) => (await tx.query(`select id from my_sessions()`)).rows)).toEqual([{ id: ids.here }]);
    // the other user's session is untouched
    expect(await as(db, { ...member, sessionId: ids.theirs }, async (tx) => (await tx.query(`select id from my_sessions()`)).rows)).toHaveLength(1);
  });
});

describe("audit log", () => {
  it("records membership, roles, deleted projects, settings and exports — readable by admins only", async () => {
    await as(db, owner, (tx) => tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [W, member.id]));
    await as(db, owner, (tx) => tx.query(`update workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2`, [W, member.id]));
    await as(db, owner, (tx) => tx.query(`update workspace_members set role = 'member' where workspace_id = $1 and user_id = $2`, [W, member.id]));
    const project = await as(db, owner, async (tx) => (await tx.query<{ id: string }>(`insert into projects (workspace_id, name, owner_id) values ($1, 'Old', $2) returning id`, [W, owner.id])).rows[0].id);
    await as(db, owner, (tx) => tx.query(`update projects set deleted_at = now() where id = $1`, [project]));
    await as(db, owner, (tx) => tx.query(`update workspaces set modules = '{"pipeline": true, "money": false, "docs": false}' where id = $1`, [W]));
    await as(db, member, (tx) => tx.query(`select log_export($1, 'json')`, [W]));
    expect(await rejects(as(db, outsider, (tx) => tx.query(`select log_export($1, 'json')`, [W])))).toMatch(/Not a member/);

    const rows = await as(db, owner, async (tx) => (await tx.query<{ action: string; actor_id: string; details: Record<string, unknown> }>(`select action, actor_id, details from audit_log where workspace_id = $1 order by created_at, action`, [W])).rows);
    const actions = rows.map((r) => r.action);
    for (const a of ["member_added", "role_changed", "project_deleted", "modules_changed", "data_exported"]) expect(actions, a).toContain(a);
    expect(rows.filter((r) => r.action === "role_changed").map((r) => [r.details.from, r.details.to])).toEqual(expect.arrayContaining([["member", "admin"], ["admin", "member"]]));
    expect(rows.find((r) => r.action === "data_exported")?.actor_id).toBe(member.id);

    // a plain member (no longer admin) and an outsider see nothing; nobody writes it by hand
    expect(await as(db, member, async (tx) => (await tx.query(`select 1 from audit_log where workspace_id = $1`, [W])).rows)).toEqual([]);
    expect(await as(db, outsider, async (tx) => (await tx.query(`select 1 from audit_log where workspace_id = $1`, [W])).rows)).toEqual([]);
    // creating a workspace is not logged as a new member
    expect(await as(db, outsider, async (tx) => (await tx.query(`select 1 from audit_log`)).rows)).toEqual([]);
    expect(await rejects(as(db, owner, (tx) => tx.query(`insert into audit_log (workspace_id, action) values ($1, 'fake')`, [W])))).toMatch(/permission denied/);
    expect(await rejects(as(db, owner, (tx) => tx.query(`select audit($1, 'fake', null, null, '{}')`, [W])))).toMatch(/permission denied/);
  });

  it("deleting a workspace with its members still works (no log rows for a vanishing workspace)", async () => {
    const W2 = await as(db, owner, async (tx) => (await tx.query<{ id: string }>(`insert into workspaces (name, owner_id) values ('Gone', $1) returning id`, [owner.id])).rows[0].id);
    await as(db, owner, (tx) => tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [W2, member.id]));
    await as(db, owner, (tx) => tx.query(`delete from workspaces where id = $1`, [W2]));
    expect(await asService(db, async (tx) => (await tx.query(`select count(*)::int as n from audit_log where workspace_id = $1`, [W2])).rows[0].n)).toBe(0);
  });
});

describe("weekly backup", () => {
  it("is on by default and claimed once a week-day", async () => {
    expect(await as(db, owner, async (tx) => (await tx.query(`select backup_enabled from profiles where id = $1`, [owner.id])).rows[0].backup_enabled)).toBe(true);
    const claim = () => asService(db, async (tx) => (await tx.query(`select claim_daily_slot($1, 'backup', '2030-01-06') as ok`, [owner.id])).rows[0].ok);
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
  });
});
