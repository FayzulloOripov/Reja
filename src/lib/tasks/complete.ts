// Completing a task. For recurring tasks the next occurrence is created with copies of its
// subtasks, checklist, labels, assignees and reminders. Pure: callers execute the plan (the
// client through the optimistic store, the Telegram bot through the service client).

import { addDays, diffDays } from "../dates";
import { nextOccurrence } from "../recurrence";
import { computeRemindAt } from "../reminders";
import type { ChecklistItem, Reminder, Task, TaskAssignee, TaskLabel } from "../types";

export interface CompletionInput {
  task: Task;
  subtasks: Task[];
  checklist: ChecklistItem[];
  labels: TaskLabel[];
  assignees: TaskAssignee[];
  /** reminders on the task that belong to anyone (automatic ones are recreated by the database) */
  reminders: Reminder[];
  tz: string;
  now: Date;
  newId: () => string;
}

export interface NextOccurrencePlan {
  task: Task;
  subtasks: Task[];
  checklist: ChecklistItem[];
  labels: TaskLabel[];
  assignees: TaskAssignee[];
  reminders: Reminder[];
}

export interface CompletionPlan {
  complete: { id: string; values: Pick<Task, "status" | "completed_at"> };
  next: NextOccurrencePlan | null;
}

export function planCompletion(input: CompletionInput): CompletionPlan {
  const { task, now, tz, newId } = input;
  const nowIso = now.toISOString();
  const plan: CompletionPlan = {
    complete: { id: task.id, values: { status: "done", completed_at: nowIso } },
    next: null,
  };
  if (!task.recurrence || task.parent_id) return plan;

  const occ = nextOccurrence(task.recurrence, { dueDate: task.due_date, dueAt: task.due_at }, tz, now);
  if (!occ) return plan;

  const delta = task.due_date ? diffDays(task.due_date, occ.dueDate) : 0;
  const shift = (d: string | null) => (d && delta ? addDays(d, delta) : d);
  const nextId = newId();

  const nextTask: Task = {
    ...task,
    id: nextId,
    status: "todo",
    completed_at: null,
    top_date: null,
    due_date: occ.dueDate,
    due_at: occ.dueAt,
    start_date: shift(task.start_date),
    deadline: task.deadline ? shift(task.deadline) : null,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
  };

  const subtasks = input.subtasks
    .filter((s) => !s.deleted_at)
    .map((s) => ({
      ...s,
      id: newId(),
      parent_id: nextId,
      status: "todo" as const,
      completed_at: null,
      top_date: null,
      due_date: shift(s.due_date),
      due_at: s.due_at && delta ? new Date(new Date(s.due_at).getTime() + delta * 86_400_000).toISOString() : s.due_at,
      created_at: nowIso,
      updated_at: nowIso,
    }));

  const checklist = input.checklist.map((c) => ({ ...c, id: newId(), task_id: nextId, done: false, created_at: nowIso, updated_at: nowIso }));
  const labels = input.labels.map((l) => ({ ...l, task_id: nextId, created_at: nowIso }));
  const assignees = input.assignees.map((a) => ({ ...a, task_id: nextId, created_at: nowIso }));

  const reminders: Reminder[] = [];
  for (const r of input.reminders) {
    if (r.is_auto) continue;
    let remindAt: Date | null;
    if (r.offset_rule === "custom") {
      const ms = occ.dueAt && task.due_at ? new Date(occ.dueAt).getTime() - new Date(task.due_at).getTime() : delta * 86_400_000;
      remindAt = new Date(new Date(r.remind_at).getTime() + ms);
    } else {
      remindAt = computeRemindAt(occ.dueDate, occ.dueAt, tz, r.offset_rule);
    }
    if (!remindAt) continue;
    reminders.push({
      ...r,
      id: newId(),
      task_id: nextId,
      remind_at: remindAt.toISOString(),
      status: "pending",
      attempts: 0,
      claimed_at: null,
      sent_at: null,
      last_error: null,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  plan.next = { task: nextTask, subtasks, checklist, labels, assignees, reminders };
  return plan;
}
