import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { projectRef, loadTestProject } from "../../scripts/test-env.mjs";

// The guard that keeps every remote test away from the production Supabase project.

const PROD = "aaaaaaaaaaaaaaaaaaaa";
const TEST = "bbbbbbbbbbbbbbbbbbbb";
const cwd = process.cwd();
const saved = { ...process.env };

function inDir(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "reja-env-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  process.chdir(dir);
}

afterEach(() => {
  process.chdir(cwd);
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

describe("test project guard", () => {
  it("reads the project ref from URLs and connection strings", () => {
    expect(projectRef(`https://${PROD}.supabase.co/rest/v1/`)).toBe(PROD);
    expect(projectRef(`postgresql://postgres.${PROD}:pw@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`)).toBe(PROD);
    expect(projectRef(`postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`)).toBe(PROD);
  });

  it("refuses to run without .env.test.local", () => {
    inDir({ ".env.local": `NEXT_PUBLIC_SUPABASE_URL=https://${PROD}.supabase.co` });
    expect(() => loadTestProject("x")).toThrow(/need \.env\.test\.local/);
  });

  it("refuses when the test file points at production (URL or database)", () => {
    inDir({ ".env.local": `NEXT_PUBLIC_SUPABASE_URL=https://${PROD}.supabase.co`, ".env.test.local": `NEXT_PUBLIC_SUPABASE_URL=https://${PROD}.supabase.co` });
    expect(() => loadTestProject("x")).toThrow(/production/);
    inDir({ ".env.local": `NEXT_PUBLIC_SUPABASE_URL=https://${PROD}.supabase.co`, ".env.test.local": `SUPABASE_DB_URL=postgresql://postgres.${PROD}:pw@host:5432/postgres` });
    expect(() => loadTestProject("x")).toThrow(/production/);
  });

  it("uses only the test project's keys, never production's", () => {
    process.env.SUPABASE_SECRET_KEY = "prod-secret";
    inDir({
      ".env.local": `NEXT_PUBLIC_SUPABASE_URL=https://${PROD}.supabase.co\nSUPABASE_SECRET_KEY=prod-secret`,
      ".env.test.local": `NEXT_PUBLIC_SUPABASE_URL=https://${TEST}.supabase.co\nSUPABASE_DB_URL=postgresql://postgres.${TEST}:pw@host:5432/postgres`,
    });
    expect(loadTestProject("x")).toBe(TEST);
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(`https://${TEST}.supabase.co`);
    expect(process.env.SUPABASE_SECRET_KEY).toBeUndefined();
  });
});
