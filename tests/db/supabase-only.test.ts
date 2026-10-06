import { describe, expect, it } from "vitest";
import { createDb, REMOTE } from "./harness";

// Pieces that exist only on Supabase (the PGlite copy skips their migrations). Remote runs only.
describe.runIf(REMOTE)("Supabase-only setup", () => {
  it("has a private attachments bucket with policies", async () => {
    const db = await createDb();
    const bucket = await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'attachments'`);
    expect(bucket.rows).toEqual([{ public: false }]);
    const policies = await db.query<{ n: number }>(`select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects'`);
    expect(policies.rows[0].n).toBeGreaterThanOrEqual(3);
  });

  it("publishes the synced tables to realtime", async () => {
    const db = await createDb();
    const rows = await db.query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`);
    const names = rows.rows.map((r) => r.tablename);
    for (const t of ["tasks", "projects", "areas", "comments", "notifications", "time_entries", "profiles"]) expect(names, t).toContain(t);
  });

  it("has pg_cron, pg_net and the cron setup function", async () => {
    const db = await createDb();
    const ext = await db.query<{ extname: string }>(`select extname from pg_extension where extname in ('pg_cron', 'pg_net') order by 1`);
    expect(ext.rows.map((r) => r.extname)).toEqual(["pg_cron", "pg_net"]);
    const fn = await db.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname = 'setup_reminder_cron'`);
    expect(fn.rows[0].n).toBe(1);
  });
});
