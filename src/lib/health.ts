// Suggested project health:
//   off_track — the target date has passed (and the project is not done)
//   at_risk   — more than 20% of open tasks are overdue, or the target is within 7 days and
//               less than 70% of tasks are done
//   on_track  — otherwise

import { diffDays } from "./dates";
import type { ISODate, Project, ProjectHealth, Task } from "./types";

export interface HealthResult {
  health: ProjectHealth;
  reason: { key: "reasonPassed" | "reasonOverdue" | "reasonDeadline" | null; percent?: number; days?: number };
  total: number;
  done: number;
  open: number;
  overdue: number;
  percentDone: number;
}

export function isOpen(t: Pick<Task, "status">) {
  return t.status !== "done" && t.status !== "cancelled";
}

export function isOverdue(t: Pick<Task, "status" | "due_date" | "deadline">, today: ISODate): boolean {
  if (!isOpen(t)) return false;
  return (t.due_date !== null && t.due_date < today) || (t.deadline !== null && t.deadline < today);
}

export function projectStats(tasks: Pick<Task, "status" | "due_date" | "deadline" | "parent_id" | "deleted_at">[], today: ISODate) {
  const top = tasks.filter((t) => !t.deleted_at && !t.parent_id && t.status !== "cancelled");
  const done = top.filter((t) => t.status === "done").length;
  const open = top.length - done;
  const overdue = top.filter((t) => isOverdue(t, today)).length;
  return { total: top.length, done, open, overdue, percentDone: top.length ? Math.round((done / top.length) * 100) : 0 };
}

export function suggestHealth(
  project: Pick<Project, "target_date" | "status">,
  tasks: Pick<Task, "status" | "due_date" | "deadline" | "parent_id" | "deleted_at">[],
  today: ISODate,
): HealthResult {
  const s = projectStats(tasks, today);
  const base = { ...s };
  if (project.status === "done" || project.status === "archived") {
    return { ...base, health: "on_track", reason: { key: null } };
  }
  if (project.target_date && project.target_date < today) {
    return { ...base, health: "off_track", reason: { key: "reasonPassed" } };
  }
  if (s.open > 0 && s.overdue / s.open > 0.2) {
    return { ...base, health: "at_risk", reason: { key: "reasonOverdue", percent: Math.round((s.overdue / s.open) * 100) } };
  }
  if (project.target_date) {
    const days = diffDays(today, project.target_date);
    if (days <= 7 && s.percentDone < 70) {
      return { ...base, health: "at_risk", reason: { key: "reasonDeadline", days, percent: s.percentDone } };
    }
  }
  return { ...base, health: "on_track", reason: { key: null } };
}

/** The health shown in the UI: manual when set manually, otherwise the suggestion. */
export function effectiveHealth(project: Pick<Project, "health" | "health_manual">, suggested: ProjectHealth): ProjectHealth {
  return project.health_manual && project.health ? project.health : suggested;
}
