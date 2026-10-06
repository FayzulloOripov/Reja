/**
 * Seed clearly fake demo data into a Supabase project for an existing user.
 *
 *   ALLOW_DEMO_SEED=true npm run seed:demo -- --email you@example.com
 *
 * Creates a "Demo agentlik" workspace with projects, tasks, habits, goals and two fake teammates
 * (partner@example.test, consultant@example.test). Refuses to run unless ALLOW_DEMO_SEED=true,
 * so production stays empty.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { buildDemoData } from "../src/lib/demo/seed";
import { normalizeSupabaseUrl } from "../src/lib/env";
import { todayIn } from "../src/lib/dates";

config({ path: ".env.local" });
config();

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("Refusing to seed: set ALLOW_DEMO_SEED=true (never in production).");
    process.exit(1);
  }
  const email = process.argv[process.argv.indexOf("--email") + 1];
  if (!email || email.startsWith("--")) {
    console.error("Usage: npm run seed:demo -- --email you@example.com");
    process.exit(1);
  }
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: me } = await sb.from("profiles").select("id, language, timezone").eq("email", email).single();
  if (!me) throw new Error(`No user with email ${email}. Sign in to the app once first.`);

  // fake teammates
  const teammate = async (mail: string, name: string) => {
    const { data: existing } = await sb.from("profiles").select("id").eq("email", mail).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await sb.auth.admin.createUser({ email: mail, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    return data.user.id;
  };
  const partner = await teammate("partner@example.test", me.language === "en" ? "Partner (demo)" : "Hamkor (demo)");
  const guest = await teammate("consultant@example.test", me.language === "en" ? "Consultant (demo)" : "Konsultant (demo)");

  const demo = buildDemoData(me.id, todayIn(me.timezone), me.timezone, me.language === "en" ? "en" : "uz");
  const DEMO_PARTNER = "00000000-0000-4000-8000-000000000002";
  const DEMO_GUEST = "00000000-0000-4000-8000-000000000003";
  const remap = (v: unknown): unknown => (v === DEMO_PARTNER ? partner : v === DEMO_GUEST ? guest : v);
  const fix = <T extends Record<string, unknown>>(rows: T[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, remap(v)])) as T);

  // only the shared workspace is seeded; the user's personal workspace already exists
  const team = demo.workspaces.find((w) => !w.is_personal)!;
  const personalId = demo.workspaces.find((w) => w.is_personal)!.id;
  const { data: realPersonal } = await sb.from("workspaces").select("id").eq("owner_id", me.id).eq("is_personal", true).single();
  const ws = (id: string) => (id === personalId ? realPersonal!.id : id);
  const wsFix = <T extends { workspace_id: string }>(rows: T[]) => rows.map((r) => ({ ...r, workspace_id: ws(r.workspace_id) }));

  const insert = async (table: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return;
    const { error } = await sb.from(table).insert(rows);
    if (error) throw new Error(`${table}: ${error.message}`);
  };

  await insert("workspaces", [team as never]);
  await insert("workspace_members", fix(demo.workspace_members.filter((m) => m.workspace_id === team.id && m.user_id !== me.id) as never));
  await insert("projects", wsFix(demo.projects) as never);
  await insert("project_members", fix(demo.project_members as never));
  await insert("sections", wsFix(demo.sections) as never);
  const tasks = wsFix(demo.tasks).map((t) => ({ ...t, created_by: me.id }));
  await insert("tasks", tasks as never);
  await insert("task_assignees", fix(wsFix(demo.task_assignees) as never));
  await insert("labels", demo.labels as never);
  await insert("task_labels", wsFix(demo.task_labels) as never);
  await insert("checklist_items", wsFix(demo.checklist_items) as never);
  await insert("habits", demo.habits as never);
  await insert("habit_logs", demo.habit_logs as never);
  await insert("goals", demo.goals as never);
  await insert("key_results", demo.key_results as never);
  await insert("key_result_history", demo.key_result_history as never);
  await insert("notes", demo.notes as never);
  await insert("time_blocks", demo.time_blocks as never);
  await insert("time_entries", wsFix(demo.time_entries) as never);
  await sb.from("profiles").update({ current_workspace_id: team.id, onboarded_at: new Date().toISOString() }).eq("id", me.id);
  console.log(`Seeded demo data for ${email}: ${demo.projects.length} projects, ${demo.tasks.length} tasks.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
