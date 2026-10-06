// Remote tests must never touch production.
//
// Every test that talks to Supabase (remote database tests, real-backend Playwright, their
// teardowns, `npm run db:push:test`) calls loadTestProject() first. It loads ONLY .env.test.local
// (the separate "reja-test" project) over the environment, and refuses to start when that file is
// missing or points at the same Supabase project as .env.local (production).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

const SUPABASE_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"];

/** The Supabase project ref in a URL or connection string ("ifjj…" from https://ifjj….supabase.co or postgres.ifjj…). */
export function projectRef(value) {
  const v = String(value ?? "").trim();
  return v.match(/https?:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1] ?? v.match(/postgres\.([a-z0-9]{20})[:@]/)?.[1] ?? v.match(/db\.([a-z0-9]{20})\.supabase\.co/)?.[1] ?? null;
}

function read(file) {
  const path = resolve(process.cwd(), file);
  return existsSync(path) ? parse(readFileSync(path)) : null;
}

/** Load .env.test.local over process.env and check it is not production. Returns the test project ref. */
export function loadTestProject(purpose = "remote tests") {
  const test = read(".env.test.local");
  if (!test) {
    throw new Error(`${purpose} need .env.test.local with the separate "reja-test" Supabase project (never the production project in .env.local).`);
  }
  for (const k of SUPABASE_KEYS) {
    if (test[k] !== undefined) process.env[k] = test[k].trim();
    else delete process.env[k]; // never fall back to production values
  }
  for (const [k, v] of Object.entries(test)) if (!SUPABASE_KEYS.includes(k)) process.env[k] = v;
  const testRefs = [projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL), projectRef(process.env.SUPABASE_DB_URL)].filter(Boolean);
  if (testRefs.length === 0) throw new Error(`${purpose}: .env.test.local has no Supabase URL or SUPABASE_DB_URL.`);
  const prod = read(".env.local") ?? {};
  const prodRefs = new Set([projectRef(prod.NEXT_PUBLIC_SUPABASE_URL), projectRef(prod.SUPABASE_DB_URL)].filter(Boolean));
  if (testRefs.some((r) => prodRefs.has(r))) {
    throw new Error(`${purpose} refused: .env.test.local points at the production Supabase project. Use the separate "reja-test" project.`);
  }
  if (new Set(testRefs).size > 1) throw new Error(`${purpose}: the URL and SUPABASE_DB_URL in .env.test.local belong to different projects.`);
  return testRefs[0];
}
