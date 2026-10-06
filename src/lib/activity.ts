// Activity entries for a change, mirroring the database triggers (public.on_task_activity,
// on_project_activity, on_assignee_added, on_comment_created). The server writes them with
// triggers; the in-browser demo uses this so its feeds look the same.

import type { ActivityEntry } from "./types";

type Row = Record<string, unknown>;

export interface ChangeForActivity {
  table: string;
  kind: "insert" | "update" | "delete";
  /** row before the change (null for inserts) */
  prev: Row | null;
  /** row after the change (null for deletes) */
  next: Row | null;
}

const TASK_FIELDS = ["title", "status", "priority", "start_date", "due_date", "due_at", "deadline", "project_id", "section_id", "parent_id", "top_date", "estimate_min", "recurrence"];

export function activityFor(change: ChangeForActivity, ctx: { actorId: string; now: string; newId: () => string; taskById: (id: string) => Row | undefined }): ActivityEntry[] {
  const { prev, next } = change;
  const entry = (row: Row, base: Partial<ActivityEntry>): ActivityEntry => ({
    id: ctx.newId(),
    workspace_id: String(row.workspace_id),
    project_id: (row.project_id as string) ?? null,
    task_id: null,
    actor_id: ctx.actorId,
    entity_type: "task",
    entity_id: null,
    action: "updated",
    diff: {},
    created_at: ctx.now,
    ...base,
  });

  if (change.table === "tasks" && next) {
    const id = String(next.id);
    if (change.kind === "insert" || !prev) return [entry(next, { task_id: id, entity_id: id, action: "created", diff: { title: next.title } })];
    if (!prev.deleted_at && next.deleted_at) return [entry(next, { task_id: id, entity_id: id, action: "deleted", diff: { title: next.title } })];
    if (prev.deleted_at && !next.deleted_at) return [entry(next, { task_id: id, entity_id: id, action: "restored", diff: { title: next.title } })];
    const diff: Row = {};
    for (const f of TASK_FIELDS) if ((prev[f] ?? null) !== (next[f] ?? null)) diff[f] = [prev[f] ?? null, next[f] ?? null];
    if (JSON.stringify(prev.description ?? null) !== JSON.stringify(next.description ?? null)) diff.description = [null, null];
    if (Object.keys(diff).length === 0) return []; // position-only changes are not interesting
    const action = diff.status && next.status === "done" ? "completed" : "updated";
    return [entry(next, { task_id: id, entity_id: id, action, diff: { ...diff, _title: next.title } })];
  }

  if (change.table === "projects" && next) {
    const id = String(next.id);
    const base = { project_id: id, entity_type: "project", entity_id: id };
    if (change.kind === "insert" || !prev) return [entry(next, { ...base, action: "created", diff: { name: next.name } })];
    if (!prev.deleted_at && next.deleted_at) return [entry(next, { ...base, action: "deleted", diff: { name: next.name } })];
    const diff: Row = {};
    for (const f of ["name", "status", "health", "target_date"]) if ((prev[f] ?? null) !== (next[f] ?? null)) diff[f] = [prev[f] ?? null, next[f] ?? null];
    return Object.keys(diff).length ? [entry(next, { ...base, action: "updated", diff: { ...diff, _name: next.name } })] : [];
  }

  if (change.table === "task_assignees" && change.kind === "insert" && next) {
    const task = ctx.taskById(String(next.task_id));
    if (!task) return [];
    return [entry(task, { task_id: String(task.id), entity_id: String(task.id), action: "assigned", diff: { user_id: next.user_id, _title: task.title } })];
  }

  if (change.table === "comments" && change.kind === "insert" && next) {
    const task = ctx.taskById(String(next.task_id));
    if (!task) return [];
    return [
      entry(task, {
        task_id: String(task.id),
        entity_type: "comment",
        entity_id: String(next.id),
        action: "commented",
        diff: { _title: task.title, snippet: String(next.body_text ?? "").slice(0, 120) },
      }),
    ];
  }

  return [];
}

/** "moved" reads better than "changed its project/section" in the feed. */
export function isMove(entry: Pick<ActivityEntry, "action" | "diff">): boolean {
  if (entry.action !== "updated") return false;
  const keys = Object.keys(entry.diff).filter((k) => !k.startsWith("_"));
  return keys.length > 0 && keys.every((k) => k === "project_id" || k === "section_id");
}
