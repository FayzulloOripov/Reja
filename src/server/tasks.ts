import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { addDays, timeIn, todayIn, zonedToUtc } from "@/lib/dates";
import { parseQuickAdd } from "@/lib/parse/quick-add";
import { planCompletion } from "@/lib/tasks/complete";
import type { ChecklistItem, Reminder, Task, TaskAssignee, TaskLabel } from "@/lib/types";

/** Server-side task operations performed on behalf of a user (Telegram bot). Access is re-checked. */

export async function canWriteTask(sb: SupabaseClient, taskId: string, userId: string): Promise<boolean> {
  const { data } = await sb.rpc("can_write_task", { p_task: taskId, p_uid: userId });
  return Boolean(data);
}

export async function completeTaskFor(sb: SupabaseClient, taskId: string, userId: string, tz: string): Promise<Task | null> {
  if (!(await canWriteTask(sb, taskId, userId))) return null;
  const { data: task } = await sb.from("tasks").select("*").eq("id", taskId).single<Task>();
  if (!task || task.deleted_at) return null;
  if (task.status === "done") return task;
  const [subtasks, checklist, labels, assignees, reminders, nextOcc] = await Promise.all([
    sb.from("tasks").select("*").eq("parent_id", taskId).is("deleted_at", null),
    sb.from("checklist_items").select("*").eq("task_id", taskId),
    sb.from("task_labels").select("*").eq("task_id", taskId),
    sb.from("task_assignees").select("*").eq("task_id", taskId),
    sb.from("reminders").select("*").eq("task_id", taskId),
    sb.from("tasks").select("id").eq("recurrence_parent_id", taskId).is("deleted_at", null).limit(1),
  ]);
  const plan = planCompletion({
    task,
    subtasks: (subtasks.data ?? []) as Task[],
    checklist: (checklist.data ?? []) as ChecklistItem[],
    labels: (labels.data ?? []) as TaskLabel[],
    assignees: (assignees.data ?? []) as TaskAssignee[],
    reminders: (reminders.data ?? []) as Reminder[],
    tz,
    now: new Date(),
    newId: randomUUID,
    hasNextOccurrence: Boolean(nextOcc.data?.length),
  });
  // conditional update: when two completions race, only one of them sees the open task
  const { data: updated } = await sb.from("tasks").update(plan.complete.values).eq("id", taskId).neq("status", "done").select("id");
  if (!updated?.length) return task;
  if (plan.next) {
    const n = plan.next;
    const strip = <T extends Record<string, unknown>>(rows: T[], drop: string[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))));
    await sb.from("tasks").insert(n.task);
    if (n.subtasks.length) await sb.from("tasks").insert(n.subtasks);
    if (n.checklist.length) await sb.from("checklist_items").insert(n.checklist);
    if (n.labels.length) await sb.from("task_labels").insert(n.labels);
    if (n.assignees.length) await sb.from("task_assignees").insert(n.assignees);
    if (n.reminders.length) await sb.from("reminders").insert(strip(n.reminders as unknown as Record<string, unknown>[], ["claimed_at"]));
  }
  return task;
}

export async function moveTaskToTomorrow(sb: SupabaseClient, taskId: string, userId: string, tz: string): Promise<boolean> {
  if (!(await canWriteTask(sb, taskId, userId))) return false;
  const { data: task } = await sb.from("tasks").select("id, due_date, due_at").eq("id", taskId).single<Pick<Task, "id" | "due_date" | "due_at">>();
  if (!task) return false;
  const tomorrow = addDays(todayIn(tz), 1);
  const due_at = task.due_at ? zonedToUtc(tomorrow, timeIn(tz, task.due_at), tz).toISOString() : null;
  await sb.from("tasks").update({ due_date: tomorrow, due_at }).eq("id", taskId);
  return true;
}

export interface BotUser {
  id: string;
  name: string;
  language: string;
  timezone: string;
  work_days: number[];
  current_workspace_id: string | null;
}

/** Create a task from free text using the quick-add parser. */
export async function createTaskFromText(sb: SupabaseClient, user: BotUser, text: string, opts: { raw?: boolean; source?: string } = {}) {
  const now = new Date();
  const today = todayIn(user.timezone, now);
  const nowMinutes = Number(timeIn(user.timezone, now).slice(0, 2)) * 60 + Number(timeIn(user.timezone, now).slice(3));
  const { data: projects } = await sb.rpc("writable_projects", { p_user: user.id });
  const list = (projects ?? []) as { id: string; name: string; workspace_id: string }[];

  let workspaceId = user.current_workspace_id;
  if (!workspaceId) {
    const { data } = await sb.from("workspaces").select("id").eq("owner_id", user.id).eq("is_personal", true).maybeSingle();
    workspaceId = data?.id ?? null;
  }
  if (!workspaceId) throw new Error("no workspace");

  const parsed = opts.raw
    ? null
    : parseQuickAdd(text, { today, nowMinutes, projects: list.map((p) => ({ id: p.id, name: p.name })), workDays: user.work_days });
  const project = parsed?.projectId ? list.find((p) => p.id === parsed.projectId) : undefined;
  const title = (parsed?.title || text).trim().slice(0, 500);
  const row = {
    id: randomUUID(),
    workspace_id: project?.workspace_id ?? workspaceId,
    project_id: project?.id ?? null,
    title,
    priority: parsed?.priority ?? "none",
    due_date: parsed?.dueDate ?? null,
    due_at: parsed?.dueDate && parsed.dueTime ? zonedToUtc(parsed.dueDate, parsed.dueTime, user.timezone).toISOString() : null,
    recurrence: parsed?.recurrence ?? null,
    top_date: parsed?.top ? today : null,
    created_by: user.id,
    source: opts.source ?? "telegram",
    position: Date.now(),
  };
  const { error } = await sb.from("tasks").insert(row);
  if (error) throw new Error(error.message);
  return { ...row, projectName: project?.name ?? null };
}
