// Workspace export, shared by the server route (real data, read through RLS) and the in-browser
// export used by the demo.

export const EXPORT_TABLES = [
  "projects",
  "project_members",
  "sections",
  "tasks",
  "task_assignees",
  "task_watchers",
  "task_dependencies",
  "labels",
  "task_labels",
  "checklist_items",
  "comments",
  "comment_reactions",
  "attachments",
  "time_entries",
  "goals",
  "key_results",
  "key_result_history",
  "notes",
  "saved_views",
  "templates",
  "contacts",
  "meetings",
  "meeting_attendees",
  "meeting_items",
  "routines",
  "routine_runs",
  "deal_stages",
  "deals",
  "deal_stage_history",
  "money_entries",
  "note_versions",
  "note_tasks",
] as const;

type Row = Record<string, unknown>;

/** One CSV row per live task, with project and section names. */
export function taskCsvRows(tasks: Row[], projects: Row[], sections: Row[]) {
  const pname = new Map(projects.map((p) => [p.id as string, p.name as string]));
  const sname = new Map(sections.map((s) => [s.id as string, s.name as string]));
  return tasks
    .filter((t) => !t.deleted_at)
    .map((t) => ({
      title: t.title,
      project: t.project_id ? (pname.get(t.project_id as string) ?? "") : "",
      section: t.section_id ? (sname.get(t.section_id as string) ?? "") : "",
      status: t.status,
      priority: t.priority,
      due: t.due_date ?? "",
      due_at: t.due_at ?? "",
      start: t.start_date ?? "",
      deadline: t.deadline ?? "",
      estimate_min: t.estimate_min ?? "",
      recurrence: t.recurrence ?? "",
      completed_at: t.completed_at ?? "",
      created_at: t.created_at,
      id: t.id,
    }));
}

export function exportFileName(workspaceName: string, ext: "json" | "csv", date = new Date()) {
  const safe = workspaceName.replace(/[^\p{L}\p{N}_-]+/gu, "-");
  return `reja-${safe}-${date.toISOString().slice(0, 10)}.${ext}`;
}
