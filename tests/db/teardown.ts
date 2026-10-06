import { config } from "dotenv";
import pg from "pg";

/** Remote runs only: delete every test user created by the database tests (and, by cascade, their data). */
export default async function teardown() {
  config({ path: ".env.test.local" });
  config({ path: ".env.local" });
  if (process.env.DB_TARGET !== "remote" || !process.env.SUPABASE_DB_URL) return;
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query(`delete from auth.users where email like '%+dbt%@example.test'`);
  console.log(`[db teardown] removed ${res.rowCount} test users`);
  await client.end();
}
