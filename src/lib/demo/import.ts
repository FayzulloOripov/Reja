// Moving what someone typed in the demo into their real account after sign-up.
//
// Every row gets a new id (demo ids are the same in every browser), references are re-pointed,
// the demo user becomes the real user, and the invented people (partner, consultant) are dropped.
// "mine" keeps only rows the visitor created, plus the demo projects/sections/tasks those rows
// live in; "all" also brings the sample data.

import { DEMO_USER_ID } from "./seed";

type Row = Record<string, unknown>;
export type Snapshot = Partial<Record<string, Record<string, Row>>>;

export interface DemoImportOptions {
  userId: string;
  workspaceId: string;
  mode: "mine" | "all";
  newId: () => string;
  now?: Date;
}

export interface DemoImportItem {
  table: string;
  kind: "insert";
  row: Row;
}

export interface DemoImportSummary {
  projects: number;
  tasks: number;
  other: number;
}

/** Marker the demo adapter puts on sample rows the visitor changed (never sent to the server). */
export const DEMO_EDITED = "__demoEdited";

/** Ids created by the seed look like 00000000-0000-4000-9000-…; anything else was typed by the visitor. */
export function isSeedId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith("00000000-0000-4000-9000-");
}

const ORDER = [
  "areas",
  "projects",
  "sections",
  "labels",
  "tasks",
  "task_labels",
  "task_assignees",
  "checklist_items",
  "goals",
  "key_results",
  "key_result_history",
  "notes",
  "habits",
  "habit_logs",
  "time_blocks",
  "time_entries",
  "contacts",
  "meetings",
  "meeting_attendees",
  "meeting_items",
  "routines",
  "routine_runs",
  "weekly_reviews",
  "daily_shutdowns",
  "deal_stages",
  "deals",
  "money_entries",
  "note_tasks",
] as const;

const list = (snap: Snapshot, table: string): Row[] => Object.values(snap[table] ?? {}).filter((r) => !r.deleted_at);

export function planDemoImport(snap: Snapshot, opts: DemoImportOptions): { items: DemoImportItem[]; summary: DemoImportSummary } {
  const now = (opts.now ?? new Date()).toISOString();
  const ids = new Map<string, string>();
  const map = (id: unknown): string | null => {
    if (typeof id !== "string") return null;
    if (!ids.has(id)) ids.set(id, opts.newId());
    return ids.get(id)!;
  };

  const taskById = new Map(list(snap, "tasks").map((t) => [t.id as string, t]));
  const chosen: Record<string, Row[]> = {};
  for (const table of ORDER) chosen[table] = [];

  // "mine": rows the visitor created, and sample rows they changed (e.g. completed a sample task)
  for (const table of ORDER) {
    for (const row of list(snap, table)) {
      if (table === "habit_logs" || table === "task_labels" || table === "task_assignees" || table === "meeting_attendees" || table === "routine_runs" || table === "note_tasks" || table === "deal_stages") continue; // decided by their parents below
      if (opts.mode === "all" || !isSeedId(row.id) || row[DEMO_EDITED]) chosen[table].push(row);
    }
  }

  // dependencies of chosen rows (the demo project a new task lives in, a parent task, …)
  const ensure = (table: string, id: unknown) => {
    if (typeof id !== "string") return;
    if (chosen[table].some((r) => r.id === id)) return;
    const row = snap[table]?.[id];
    if (row && !row.deleted_at) {
      chosen[table].push(row);
      deps(table, row);
    }
  };
  function deps(table: string, row: Row) {
    if (table === "projects") ensure("areas", row.area_id);
    if (table === "sections") ensure("projects", row.project_id);
    if (table === "tasks") {
      ensure("projects", row.project_id);
      ensure("sections", row.section_id);
      ensure("tasks", row.parent_id);
    }
    if (table === "checklist_items") ensure("tasks", row.task_id);
    if (table === "key_results") ensure("goals", row.goal_id);
    if (table === "key_result_history") ensure("key_results", row.key_result_id);
    if (table === "goals") ensure("projects", row.project_id);
    if (table === "notes") ensure("projects", row.project_id);
    if (table === "time_blocks" || table === "time_entries") ensure("tasks", row.task_id);
    if (table === "tasks") ensure("contacts", row.waiting_on_contact_id);
    if (table === "meetings") ensure("projects", row.project_id);
    if (table === "meeting_items") ensure("meetings", row.meeting_id);
    if (table === "deals") {
      ensure("deal_stages", row.stage_id);
      ensure("contacts", row.contact_id);
      ensure("projects", row.project_id);
    }
    if (table === "money_entries") ensure("projects", row.project_id);
  }
  for (const table of ORDER) for (const row of [...chosen[table]]) deps(table, row);

  const taskIds = new Set(chosen.tasks.map((t) => t.id as string));
  const habitIds = new Set(chosen.habits.map((h) => h.id as string));
  const labelIds = new Set(chosen.labels.map((l) => l.id as string));
  for (const tl of list(snap, "task_labels")) {
    if (taskIds.has(tl.task_id as string)) {
      if (!labelIds.has(tl.label_id as string)) {
        const label = snap.labels?.[tl.label_id as string];
        if (!label) continue;
        chosen.labels.push(label);
        labelIds.add(label.id as string);
      }
      chosen.task_labels.push(tl);
    }
  }
  for (const a of list(snap, "task_assignees")) if (taskIds.has(a.task_id as string) && a.user_id === DEMO_USER_ID) chosen.task_assignees.push(a);
  for (const l of list(snap, "habit_logs")) if (habitIds.has(l.habit_id as string)) chosen.habit_logs.push(l);
  // ticking a sample routine or adding someone to a sample meeting brings that routine/meeting along
  if (opts.mode === "mine") {
    for (const r of list(snap, "routine_runs")) if (!isSeedId(r.id) || r[DEMO_EDITED]) ensure("routines", r.routine_id);
    for (const a of list(snap, "meeting_attendees")) if (!isSeedId(a.id)) ensure("meetings", a.meeting_id);
  }
  const meetingIds = new Set(chosen.meetings.map((m) => m.id as string));
  for (const i of list(snap, "meeting_items")) if (meetingIds.has(i.meeting_id as string) && !chosen.meeting_items.includes(i)) chosen.meeting_items.push(i);
  for (const a of list(snap, "meeting_attendees")) {
    if (!meetingIds.has(a.meeting_id as string)) continue;
    if (a.user_id === DEMO_USER_ID) chosen.meeting_attendees.push(a);
    else if (a.contact_id) {
      ensure("contacts", a.contact_id);
      chosen.meeting_attendees.push(a);
    }
  }
  const noteIds = new Set(chosen.notes.map((n) => n.id as string));
  for (const l of list(snap, "note_tasks")) if (noteIds.has(l.note_id as string) && chosen.tasks.some((t) => t.id === l.task_id)) chosen.note_tasks.push(l);
  if (opts.mode === "all") for (const st of list(snap, "deal_stages")) if (!chosen.deal_stages.includes(st)) chosen.deal_stages.push(st);
  const routineIds = new Set(chosen.routines.map((r) => r.id as string));
  for (const r of list(snap, "routine_runs")) if (routineIds.has(r.routine_id as string) && r.user_id === DEMO_USER_ID) chosen.routine_runs.push(r);

  // parents before children
  const depth = (t: Row): number => {
    let d = 0;
    let cur = t;
    while (cur.parent_id && taskById.has(cur.parent_id as string) && d < 20) {
      cur = taskById.get(cur.parent_id as string)!;
      d++;
    }
    return d;
  };
  chosen.tasks.sort((a, b) => depth(a) - depth(b));

  const ws = opts.workspaceId;
  const me = opts.userId;
  const items: DemoImportItem[] = [];
  const push = (table: string, row: Row) => {
    const { [DEMO_EDITED]: _edited, ...clean } = row;
    void _edited;
    items.push({ table, kind: "insert", row: clean });
  };

  for (const r of chosen.areas) push("areas", { ...r, id: map(r.id), workspace_id: ws, owner_id: me, created_at: now, updated_at: now });
  for (const r of chosen.projects)
    push("projects", {
      ...r,
      id: map(r.id),
      workspace_id: ws,
      owner_id: me,
      area_id: r.area_id && chosen.areas.some((a) => a.id === r.area_id) ? map(r.area_id) : null,
      share_token: null,
      telegram_chat_id: null,
      telegram_link_code: null,
      created_at: now,
      updated_at: now,
    });
  for (const r of chosen.sections) push("sections", { ...r, id: map(r.id), workspace_id: ws, project_id: map(r.project_id), created_at: now, updated_at: now });
  for (const r of chosen.labels) push("labels", { ...r, id: map(r.id), workspace_id: ws, created_at: now, updated_at: now });
  const contactIds = new Set(chosen.contacts.map((c) => c.id as string));
  for (const r of chosen.contacts) push("contacts", { ...r, id: map(r.id), workspace_id: ws, created_by: me, created_at: now, updated_at: now });
  for (const r of chosen.tasks) {
    // waiting on a contact that comes along keeps its link; the demo's invented people are dropped
    const waitContact = r.waiting_on_contact_id && contactIds.has(r.waiting_on_contact_id as string) ? map(r.waiting_on_contact_id) : null;
    const waiting = { waiting_on_contact_id: waitContact, waiting_on_user_id: null, ...(waitContact ? {} : { waiting_since: null, follow_up_date: null, status: r.status === "waiting" ? "todo" : r.status }) };
    push("tasks", {
      ...r,
      ...waiting,
      id: map(r.id),
      workspace_id: ws,
      project_id: r.project_id ? map(r.project_id) : null,
      section_id: r.section_id ? map(r.section_id) : null,
      parent_id: r.parent_id && taskIds.has(r.parent_id as string) ? map(r.parent_id) : null,
      recurrence_parent_id: null,
      created_by: me,
      source: "demo",
      created_at: now,
      updated_at: now,
    });
  }
  for (const r of chosen.task_labels) push("task_labels", { task_id: map(r.task_id), label_id: map(r.label_id), workspace_id: ws, created_at: now });
  for (const r of chosen.task_assignees) push("task_assignees", { task_id: map(r.task_id), user_id: me, workspace_id: ws, created_at: now });
  for (const r of chosen.checklist_items) push("checklist_items", { ...r, id: map(r.id), task_id: map(r.task_id), workspace_id: ws, created_at: now, updated_at: now });
  for (const r of chosen.goals) push("goals", { ...r, id: map(r.id), workspace_id: ws, owner_id: me, project_id: r.project_id ? map(r.project_id) : null, created_at: now, updated_at: now });
  for (const r of chosen.key_results) push("key_results", { ...r, id: map(r.id), goal_id: map(r.goal_id), workspace_id: ws, created_at: now, updated_at: now });
  for (const r of chosen.key_result_history) push("key_result_history", { ...r, id: map(r.id), key_result_id: map(r.key_result_id), workspace_id: ws, recorded_by: me });
  for (const r of chosen.notes) push("notes", { ...r, id: map(r.id), workspace_id: ws, project_id: map(r.project_id), created_by: me, created_at: now, updated_at: now });
  for (const r of chosen.habits) push("habits", { ...r, id: map(r.id), user_id: me });
  for (const r of chosen.habit_logs) push("habit_logs", { ...r, habit_id: map(r.habit_id), user_id: me });
  for (const r of chosen.time_blocks) push("time_blocks", { ...r, id: map(r.id), user_id: me, task_id: r.task_id && taskIds.has(r.task_id as string) ? map(r.task_id) : null, created_at: now, updated_at: now });
  for (const r of chosen.time_entries)
    push("time_entries", { ...r, id: map(r.id), user_id: me, workspace_id: ws, task_id: r.task_id && taskIds.has(r.task_id as string) ? map(r.task_id) : null, created_at: now });

  for (const r of chosen.meetings) push("meetings", { ...r, id: map(r.id), workspace_id: ws, project_id: r.project_id ? map(r.project_id) : null, series_id: r.series_id ? map(r.series_id) : null, created_by: me, created_at: now, updated_at: now });
  for (const r of chosen.meeting_attendees)
    push("meeting_attendees", { ...r, id: map(r.id), meeting_id: map(r.meeting_id), workspace_id: ws, user_id: r.user_id ? me : null, contact_id: r.contact_id ? map(r.contact_id) : null, created_at: now });
  for (const r of chosen.meeting_items)
    push("meeting_items", { ...r, id: map(r.id), meeting_id: map(r.meeting_id), workspace_id: ws, task_id: r.task_id && taskIds.has(r.task_id as string) ? map(r.task_id) : null, created_by: me, created_at: now, updated_at: now });
  for (const r of chosen.routines) push("routines", { ...r, id: map(r.id), workspace_id: ws, owner_id: me, created_at: now, updated_at: now });
  for (const r of chosen.routine_runs) push("routine_runs", { ...r, id: map(r.id), routine_id: map(r.routine_id), workspace_id: ws, user_id: me, created_at: now, updated_at: now });
  for (const r of chosen.weekly_reviews) push("weekly_reviews", { ...r, id: map(r.id), user_id: me, created_at: now, updated_at: now });
  for (const r of chosen.daily_shutdowns) push("daily_shutdowns", { ...r, id: map(r.id), user_id: me, created_at: now, updated_at: now });

  const stageIds = new Set(chosen.deal_stages.map((st) => st.id as string));
  const projectIds = new Set(chosen.projects.map((pr) => pr.id as string));
  for (const r of chosen.deal_stages) push("deal_stages", { ...r, id: map(r.id), workspace_id: ws, created_at: now, updated_at: now });
  for (const r of chosen.deals) {
    if (!stageIds.has(r.stage_id as string)) continue;
    push("deals", {
      ...r,
      id: map(r.id),
      workspace_id: ws,
      stage_id: map(r.stage_id),
      owner_id: me,
      contact_id: r.contact_id && contactIds.has(r.contact_id as string) ? map(r.contact_id) : null,
      project_id: r.project_id && projectIds.has(r.project_id as string) ? map(r.project_id) : null,
      created_by: me,
      created_at: now,
      updated_at: now,
    });
  }
  for (const r of chosen.money_entries) {
    // amount_uzs is computed by the database; money the invented partner handled goes to the fund
    const { amount_uzs: _uzs, ...rest } = r;
    void _uzs;
    push("money_entries", {
      ...rest,
      id: map(r.id),
      workspace_id: ws,
      project_id: r.project_id && projectIds.has(r.project_id as string) ? map(r.project_id) : null,
      partner_id: r.partner_id === DEMO_USER_ID ? me : null,
      status: "approved",
      approved_by: null,
      approved_at: null,
      created_by: me,
      created_at: now,
      updated_at: now,
    });
  }
  for (const r of chosen.note_tasks) push("note_tasks", { note_id: map(r.note_id), task_id: map(r.task_id), workspace_id: ws, created_at: now });

  const summary: DemoImportSummary = {
    projects: chosen.projects.length,
    tasks: chosen.tasks.length,
    other: items.length - chosen.projects.length - chosen.tasks.length,
  };
  return { items, summary };
}
