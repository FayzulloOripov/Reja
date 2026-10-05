import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

export type Db = PGlite;

export async function createDb(): Promise<Db> {
  const db = new PGlite();
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
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
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
