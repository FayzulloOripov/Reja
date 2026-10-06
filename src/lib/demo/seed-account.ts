// Write the demo sample data into a real Supabase account (service-role client): used by
// `npm run seed:demo` and by the Playwright suite when it runs against the real backend.
//
// Every row gets a fresh id (the seed's ids are fixed), the fake partner and consultant become
// real users passed in by the caller, the demo's personal workspace maps to the user's own, and the
// "Demo agentlik" workspace is created with the user as owner.

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn } from "../dates";
import { buildDemoData, DEMO_USER_ID } from "./seed";
import { isSeedId } from "./import";

const DEMO_PARTNER = "00000000-0000-4000-8000-000000000002";
const DEMO_GUEST = "00000000-0000-4000-8000-000000000003";

type Row = Record<string, unknown>;

export interface SeedPeople {
  me: string;
  partner: string;
  guest: string;
}

export async function seedDemoAccount(sb: SupabaseClient, people: SeedPeople, opts: { lang?: "uz" | "en"; tz?: string } = {}) {
  const tz = opts.tz ?? "Asia/Tashkent";
  const lang = opts.lang ?? "uz";
  const demo = buildDemoData(DEMO_USER_ID, todayIn(tz), tz, lang) as unknown as Record<string, Row[]>;

  const { data: personal, error: pErr } = await sb.from("workspaces").select("id").eq("owner_id", people.me).eq("is_personal", true).single();
  if (pErr || !personal) throw new Error(`personal workspace of ${people.me}: ${pErr?.message}`);
  const demoPersonal = (demo.workspaces as Row[]).find((w) => w.is_personal)!.id as string;

  const ids = new Map<string, string>([
    [DEMO_USER_ID, people.me],
    [DEMO_PARTNER, people.partner],
    [DEMO_GUEST, people.guest],
    [demoPersonal, personal.id as string],
  ]);
  const remap = (v: unknown): unknown => {
    if (typeof v !== "string") return v;
    if (ids.has(v)) return ids.get(v);
    if (isSeedId(v)) {
      const fresh = crypto.randomUUID();
      ids.set(v, fresh);
      return fresh;
    }
    return v;
  };
  const fix = (rows: Row[] = []) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? v.map(remap) : remap(v)])));

  const insert = async (table: string, rows: Row[]) => {
    if (!rows.length) return;
    const { error } = await sb.from(table).insert(rows);
    if (error) throw new Error(`${table}: ${error.message}`);
  };

  // the split rule is keyed by user id: point it at the real people
  const team = fix((demo.workspaces as Row[]).filter((w) => !w.is_personal)).map((w) => {
    const split = w.money_split as { fund_pct: number; shares: Record<string, number> } | null;
    return split ? { ...w, money_split: { ...split, shares: Object.fromEntries(Object.entries(split.shares).map(([k, v]) => [remap(k), v])) } } : w;
  });
  await insert("workspaces", team);
  // the owner's membership is added by a trigger
  await insert("workspace_members", fix((demo.workspace_members as Row[]).filter((m) => m.user_id !== DEMO_USER_ID)));
  await insert("areas", fix(demo.areas));
  await insert("projects", fix(demo.projects));
  await insert("project_members", fix(demo.project_members));
  await insert("sections", fix(demo.sections));
  await insert("contacts", fix(demo.contacts));
  await insert("tasks", fix(demo.tasks));
  await insert("task_assignees", fix(demo.task_assignees));
  await insert("labels", fix(demo.labels));
  await insert("task_labels", fix(demo.task_labels));
  await insert("checklist_items", fix(demo.checklist_items));
  await insert("comments", fix(demo.comments));
  await insert("activity_log", fix(demo.activity_log));
  await insert("notifications", fix(demo.notifications).map((n) => ({ ...n, delivery: "done" })));
  await insert("habits", fix(demo.habits));
  await insert("habit_logs", fix(demo.habit_logs));
  await insert("goals", fix(demo.goals));
  await insert("key_results", fix(demo.key_results));
  await insert("key_result_history", fix(demo.key_result_history));
  await insert("notes", fix(demo.notes));
  await insert("time_blocks", fix(demo.time_blocks));
  await insert("time_entries", fix(demo.time_entries));
  await insert("meetings", fix(demo.meetings));
  await insert("meeting_attendees", fix(demo.meeting_attendees));
  await insert("meeting_items", fix(demo.meeting_items));
  await insert("routines", fix(demo.routines));
  await insert("routine_runs", fix(demo.routine_runs));
  await insert("weekly_reviews", fix(demo.weekly_reviews));
  await insert("deal_stages", fix(demo.deal_stages));
  await insert("deals", fix(demo.deals));
  // amount_uzs is computed by the database
  await insert("money_entries", fix(demo.money_entries).map(({ amount_uzs: _uzs, ...r }) => (void _uzs, r)));
  await insert("note_versions", fix(demo.note_versions));
  await insert("note_tasks", fix(demo.note_tasks));

  const teamId = team[0]?.id as string;
  const { error } = await sb.from("profiles").update({ current_workspace_id: teamId, onboarded_at: new Date().toISOString(), timezone: tz, language: lang }).eq("id", people.me);
  if (error) throw new Error(`profiles: ${error.message}`);
  return { workspaceId: teamId, projects: demo.projects.length, tasks: demo.tasks.length };
}
