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
      if (table === "habit_logs" || table === "task_labels" || table === "task_assignees") continue; // decided by their parents below
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
  for (const r of chosen.tasks)
    push("tasks", {
      ...r,
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

  const summary: DemoImportSummary = {
    projects: chosen.projects.length,
    tasks: chosen.tasks.length,
    other: items.length - chosen.projects.length - chosen.tasks.length,
  };
  return { items, summary };
}
