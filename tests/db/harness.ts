import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

// Two targets:
//   • default: PGlite (real Postgres in WASM) with the Supabase shim below, migrations applied fresh;
//   • DB_TARGET=remote: the Supabase project in SUPABASE_DB_URL (migrations already pushed). Test
//     users get unique emails ("…+dbt<run>@…") and are deleted again at the end (see teardown.ts).
config({ path: ".env.test.local" });
config({ path: ".env.local" });
export const REMOTE = process.env.DB_TARGET === "remote";
export const RUN_TAG = `dbt${Date.now().toString(36)}`;

export interface Transaction {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}
export interface Db extends Transaction {
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

let pool: pg.Pool | null = null;
function remoteDb(): Db {
  if (!process.env.SUPABASE_DB_URL) throw new Error("DB_TARGET=remote needs SUPABASE_DB_URL in .env.local");
  pool ??= new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 3, ssl: { rejectUnauthorized: false } });
  const p = pool;
  const wrap = (c: pg.PoolClient | pg.Pool): Transaction => ({
    query: async <T,>(sql: string, params?: unknown[]) => ({ rows: (await c.query(sql, params as unknown[])).rows as T[] }),
    exec: (sql: string) => c.query(sql),
  });
  return {
    ...wrap(p),
    async transaction(fn) {
      const client = await p.connect();
      try {
        await client.query("begin");
        const out = await fn(wrap(client));
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

/** The email as written in the test (remote runs add a "+dbt…" tag). */
export function plainEmail(email: string): string {
  return email.replace(/\+dbt[a-z0-9]+@/, "@");
}

export async function closeRemote() {
  await pool?.end();
  pool = null;
}

/**
 * Real Postgres (PGlite/WASM) with a minimal Supabase shim: the anon/authenticated/service_role
 * roles, auth.users, auth.uid() and auth.email(). Migrations marked `-- pglite:skip` (storage,
 * realtime, pg_cron) need Supabase-only extensions and are verified on the hosted project.
 */
const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '')
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

export async function createDb(): Promise<Db> {
  if (REMOTE) return remoteDb();
  const db = new PGlite() as unknown as Db & PGlite;
  await db.exec(SHIM);
  const dir = join(process.cwd(), "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    if (sql.startsWith("-- pglite:skip")) continue;
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export interface TestUser {
  id: string;
  email: string;
  personalWorkspace: string;
}

export async function createUser(db: Db, email: string, name?: string): Promise<TestUser> {
  if (REMOTE) email = email.replace("@", `+${RUN_TAG}@`);
  const { rows } = await db.query<{ id: string }>(
    REMOTE
      ? `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, $2, now(), now()) returning id`
      : `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify({ full_name: name ?? email.split("@")[0] })],
  );
  const id = rows[0].id;
  const ws = await db.query<{ current_workspace_id: string }>(
    `select current_workspace_id from public.profiles where id = $1`,
    [id],
  );
  return { id, email, personalWorkspace: ws.rows[0].current_workspace_id };
}

/** Run statements as a signed-in user, inside a rolled-forward transaction. */
export async function as<T>(
  db: Db,
  user: TestUser | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (user) {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.email', $2, true)`, [
        user.id,
        user.email,
      ]);
      await tx.exec(`set local role authenticated`);
    } else {
      await tx.exec(`set local role anon`);
    }
    return fn(tx);
  });
}

export async function asService<T>(db: Db, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role service_role`);
    return fn(tx);
  });
}

/** Expect the promise to fail (RLS check violation or permission error). */
export async function rejects(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("Expected the statement to be rejected, but it succeeded");
}
