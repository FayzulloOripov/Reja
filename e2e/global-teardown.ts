import { createClient } from "@supabase/supabase-js";
import { loadTestProject } from "../scripts/test-env.mjs";

/**
 * After a run against the real backend: delete every test user (e2e+…@example.test) and, through
 * the account-deletion rules, their workspaces and data. The per-test cleanup in helpers.ts only
 * runs for the first spec that imports it, so this is the guarantee.
 */
export default async function globalTeardown() {
  if (process.env.E2E_BACKEND !== "real") return;
  loadTestProject("Real-backend teardown");
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let removed = 0;
  for (let round = 0; round < 50; round++) {
    const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const tests = data.users.filter((u) => /^e2e\+.*@example\.test$/.test(u.email ?? ""));
    if (tests.length === 0) break;
    for (const u of tests) {
      const { error: delError } = await sb.auth.admin.deleteUser(u.id);
      if (delError) throw new Error(`delete ${u.email}: ${delError.message}`);
      removed++;
    }
  }
  console.log(`[e2e teardown] removed ${removed} test users`);
}
