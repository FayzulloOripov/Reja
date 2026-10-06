import { beforeAll, describe, expect, it } from "vitest";
import { as, asService, createDb, createUser, rejects, type Db, type TestUser } from "./harness";

// Phase 7: Google tokens never reach the browser; calendar events and prayer settings are personal.

let db: Db;
let me: TestUser, other: TestUser;

beforeAll(async () => {
  db = await createDb();
  me = await createUser(db, "p7-me@example.test", "Me");
  other = await createUser(db, "p7-other@example.test", "Other");
  await asService(db, async (tx) => {
    await tx.query(`insert into google_connections (user_id, email, refresh_token) values ($1, 'me@gmail.test', 'refresh-secret')`, [me.id]);
    await tx.query(`insert into calendar_events (user_id, google_id, title, start_at, end_at) values ($1, 'e1', 'Dentist', '2030-01-10T05:00:00Z', '2030-01-10T06:00:00Z')`, [me.id]);
  });
});

describe("Google Calendar", () => {
  it("tokens are server-only; the client sees only the status", async () => {
    expect(await rejects(as(db, me, (tx) => tx.query(`select refresh_token from google_connections`)))).toMatch(/permission denied/);
    const status = await as(db, me, async (tx) => (await tx.query(`select connected, email from google_status()`)).rows);
    expect(status).toEqual([{ connected: true, email: "me@gmail.test" }]);
    expect(await as(db, other, async (tx) => (await tx.query(`select * from google_status()`)).rows)).toEqual([]);
  });

  it("calendar events are visible to their owner only and cannot be written from the client", async () => {
    expect(await as(db, me, async (tx) => (await tx.query(`select title from calendar_events`)).rows)).toEqual([{ title: "Dentist" }]);
    expect(await as(db, other, async (tx) => (await tx.query(`select title from calendar_events`)).rows)).toEqual([]);
    expect(await rejects(as(db, me, (tx) => tx.query(`insert into calendar_events (user_id, google_id, start_at, end_at) values ($1, 'x', now(), now())`, [me.id])))).toMatch(/permission denied/);
  });
});

describe("personal settings", () => {
  it("prayer settings belong to the profile; energy is deep or quick", async () => {
    await as(db, me, (tx) => tx.query(`update profiles set prayer_enabled = true, prayer_city = 'Toshkent', prayer_lat = 41.3111, prayer_lng = 69.2797 where id = $1`, [me.id]));
    const row = await as(db, me, async (tx) => (await tx.query(`select prayer_enabled, prayer_madhab, prayer_minutes from profiles where id = $1`, [me.id])).rows[0]);
    expect(row).toEqual({ prayer_enabled: true, prayer_madhab: "hanafi", prayer_minutes: 20 });
    expect(await rejects(as(db, me, (tx) => tx.query(`insert into tasks (workspace_id, title, energy) values ($1, 'x', 'medium')`, [me.personalWorkspace])))).toMatch(/check/);
    await as(db, me, (tx) => tx.query(`insert into tasks (workspace_id, title, energy) values ($1, 'Deep one', 'deep')`, [me.personalWorkspace]));
  });
});
