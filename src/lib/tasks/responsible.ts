// Who is responsible for a task: its assignees, or — when nobody is assigned — the person who
// created it. The same rule drives Home ("my tasks"), workload, reminders (sync_task_reminders in
// the database) and the delegated view.

import type { Task, TaskAssignee } from "../types";

export function responsibleIds(task: Pick<Task, "id" | "created_by">, byTask: Record<string, Pick<TaskAssignee, "user_id">[] | undefined>): string[] {
  const ids = (byTask[task.id] ?? []).map((a) => a.user_id);
  if (ids.length) return ids;
  return task.created_by ? [task.created_by] : [];
}

/** Tasks someone created or follows but that others are responsible for ("delegated"). */
export function isDelegatedBy(task: Pick<Task, "id" | "created_by">, userId: string, byTask: Record<string, Pick<TaskAssignee, "user_id">[] | undefined>, watching: boolean): boolean {
  const owners = responsibleIds(task, byTask);
  if (owners.length === 0 || owners.includes(userId)) return false;
  return task.created_by === userId || watching;
}
