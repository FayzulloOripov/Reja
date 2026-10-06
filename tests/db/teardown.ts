import pg from "pg";
import { loadTestProject } from "../../scripts/test-env.mjs";

/** Remote runs only: delete every test user created by the database tests (and, by cascade, their data). */
export default async function teardown() {
  if (process.env.DB_TARGET !== "remote") return;
  loadTestProject("Remote database teardown");
  if (!process.env.SUPABASE_DB_URL) return;
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL.trim(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  // one at a time, like real account deletions: a shared workspace passes to a remaining member,
  // which fails if that member is deleted in the same statement
  const { rows } = await client.query<{ id: string }>(`select id from auth.users where email like '%+dbt%@example.test'`);
  let removed = 0;
  for (const { id } of rows) {
    try {
      await client.query(`delete from auth.users where id = $1`, [id]);
      removed++;
    } catch (e) {
      console.error(`[db teardown] ${id}: ${(e as Error).message}`);
    }
  }
  console.log(`[db teardown] removed ${removed} of ${rows.length} test users`);
  await client.end();
}
