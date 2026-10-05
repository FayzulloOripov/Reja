import { addDays, startOfWeek } from "./dates";
import { isOpen } from "./health";
import { matches } from "./text";
import type { Task, TaskFilters } from "./types";

export interface FilterContext {
  today: string;
  assigneesByTask: Record<string, { user_id: string }[]>;
  labelsByTask: Record<string, { label_id: string }[]>;
}

export function applyFilters(tasks: Task[], f: TaskFilters, ctx: FilterContext): Task[] {
  const weekEnd = addDays(startOfWeek(ctx.today), 6);
  return tasks.filter((t) => {
    if (!f.showDone && !isOpen(t)) return false;
    if (f.statuses?.length && !f.statuses.includes(t.status)) return false;
    if (f.priorities?.length && !f.priorities.includes(t.priority)) return false;
    if (f.projects?.length && !f.projects.includes(t.project_id ?? "")) return false;
    if (f.assignees?.length) {
      const a = (ctx.assigneesByTask[t.id] ?? []).map((x) => x.user_id);
      const wantsUnassigned = f.assignees.includes("none");
      if (!(f.assignees.some((id) => a.includes(id)) || (wantsUnassigned && a.length === 0))) return false;
    }
    if (f.labels?.length) {
      const l = (ctx.labelsByTask[t.id] ?? []).map((x) => x.label_id);
      if (!f.labels.some((id) => l.includes(id))) return false;
    }
    switch (f.due) {
      case "overdue":
        if (!(t.due_date && t.due_date < ctx.today)) return false;
        break;
      case "today":
        if (t.due_date !== ctx.today) return false;
        break;
      case "week":
        if (!(t.due_date && t.due_date >= ctx.today && t.due_date <= weekEnd)) return false;
        break;
      case "none":
        if (t.due_date) return false;
        break;
    }
    if (f.search?.trim() && !matches(t.title, f.search)) return false;
    return true;
  });
}

export function countActiveFilters(f: TaskFilters): number {
  return (
    (f.assignees?.length ? 1 : 0) +
    (f.labels?.length ? 1 : 0) +
    (f.priorities?.length ? 1 : 0) +
    (f.statuses?.length ? 1 : 0) +
    (f.projects?.length ? 1 : 0) +
    (f.due ? 1 : 0) +
    (f.search?.trim() ? 1 : 0)
  );
}

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;

/** Default ordering inside a list: manual position, then priority. */
export function byPosition(a: Task, b: Task) {
  return a.position - b.position || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

/** Ordering for date-driven lists: time of day, priority, then position. */
export function byDueThenPriority(a: Task, b: Task) {
  const at = a.due_at ?? "~";
  const bt = b.due_at ?? "~";
  return (a.due_date ?? "~").localeCompare(b.due_date ?? "~") || at.localeCompare(bt) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.position - b.position;
}

export function byPriority(a: Task, b: Task) {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byDueThenPriority(a, b);
}
