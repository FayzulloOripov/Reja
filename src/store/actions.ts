"use client";

// Domain actions. Every common action is optimistic (applied locally first, synced in the
// background) and the destructive ones offer an undo toast.

import { toast } from "sonner";
import { addDays, todayIn, zonedToUtc } from "@/lib/dates";
import { tr } from "@/lib/i18n-client";
import { computeRemindAt } from "@/lib/reminders";
import { planCompletion } from "@/lib/tasks/complete";
import type {
  Comment,
  Goal,
  Habit,
  KeyResult,
  Note,
  Profile,
  Project,
  ReminderOffset,
  RichDoc,
  Section,
  Task,
  TaskPriority,
  TemplateTask,
  TimeBlock,
  Workspace,
} from "@/lib/types";
import {
  newChecklistItem,
  newComment,
  newGoal,
  newHabit,
  newKeyResult,
  newLabel,
  newNote,
  newProject,
  newReminder,
  newSection,
  newTask,
  newTimeBlock,
  newTimeEntry,
  newWorkspace,
  uuid,
} from "./factories";
import { assigneesByTask, checklistByTask, labelsByTask, subtasksByParent } from "./hooks";
import { mutate, useStore, type MutationInput } from "./store";
import { PROFILE_EDITABLE } from "./tables";

const S = () => useStore.getState();
const uid = () => S().userId ?? "";
const me = () => S().data.profiles[uid()];
const tz = () => me()?.timezone || "Asia/Tashkent";
const today = () => todayIn(tz());
const nowIso = () => new Date().toISOString();

function undoToast(message: string, inverse: MutationInput[]) {
  toast(message, {
    action: { label: tr("common.undo"), onClick: () => mutate(inverse) },
  });
}

// ------------------------------------------------------------------ tasks

export interface CreateTaskInput {
  title: string;
  workspaceId?: string;
  projectId?: string | null;
  sectionId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  priority?: TaskPriority | null;
  recurrence?: string | null;
  top?: boolean;
  assigneeIds?: string[];
  labelIds?: string[];
  description?: RichDoc;
  status?: Task["status"];
  source?: string | null;
  position?: number;
}

export function createTask(input: CreateTaskInput): Task {
  const d = S().data;
  const project = input.projectId ? d.projects[input.projectId] : undefined;
  const parent = input.parentId ? d.tasks[input.parentId] : undefined;
  const workspaceId =
    parent?.workspace_id ?? project?.workspace_id ?? input.workspaceId ?? me()?.current_workspace_id ?? Object.values(d.workspaces)[0]?.id;
  const dueAt = input.dueDate && input.dueTime ? zonedToUtc(input.dueDate, input.dueTime, tz()).toISOString() : null;
  const task = newTask({
    workspace_id: workspaceId!,
    title: input.title.trim(),
    project_id: parent?.project_id ?? input.projectId ?? null,
    section_id: input.sectionId ?? null,
    parent_id: input.parentId ?? null,
    due_date: input.dueDate ?? null,
    due_at: dueAt,
    start_date: input.startDate ?? null,
    deadline: input.deadline ?? null,
    priority: input.priority ?? "none",
    recurrence: input.recurrence ?? null,
    top_date: input.top ? today() : null,
    description: input.description ?? null,
    status: input.status ?? "todo",
    created_by: uid(),
    source: input.source ?? null,
    position: input.position ?? Date.now(),
  });
  const ops: MutationInput[] = [{ table: "tasks", kind: "insert", row: task }];
  for (const user_id of input.assigneeIds ?? []) {
    ops.push({ table: "task_assignees", kind: "insert", row: { task_id: task.id, user_id, workspace_id: task.workspace_id, created_at: nowIso() } });
  }
  for (const label_id of input.labelIds ?? []) {
    ops.push({ table: "task_labels", kind: "insert", row: { task_id: task.id, label_id, workspace_id: task.workspace_id, created_at: nowIso() } });
  }
  mutate(ops);
  if (input.top) warnIfTopFull(task.top_date!, task.id);
  return task;
}

export function updateTask(id: string, values: Partial<Task>, undoMessage?: string) {
  const inverse = mutate([{ table: "tasks", kind: "update", row: { id }, values }]);
  if (undoMessage) undoToast(undoMessage, inverse);
  return inverse;
}

export function setDue(task: Task, date: string | null, time?: string | null) {
  const keepTime = time === undefined && task.due_at ? new Date(task.due_at) : null;
  let due_at: string | null = null;
  if (date && time) due_at = zonedToUtc(date, time, tz()).toISOString();
  else if (date && keepTime) {
    const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: tz(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(keepTime);
    due_at = zonedToUtc(date, hhmm, tz()).toISOString();
  }
  const values: Partial<Task> = { due_date: date, due_at };
  if (date && task.start_date && task.start_date > date) values.start_date = date;
  updateTask(task.id, values);
}

export function toggleComplete(task: Task, opts: { silent?: boolean } = {}) {
  if (task.status === "done") {
    mutate([{ table: "tasks", kind: "update", row: { id: task.id }, values: { status: "todo", completed_at: null } }]);
    return;
  }
  const d = S().data;
  const plan = planCompletion({
    task,
    subtasks: subtasksByParent(d.tasks)[task.id] ?? [],
    checklist: checklistByTask(d.checklist_items)[task.id] ?? [],
    labels: labelsByTask(d.task_labels)[task.id] ?? [],
    assignees: assigneesByTask(d.task_assignees)[task.id] ?? [],
    reminders: Object.values(d.reminders).filter((r) => r.task_id === task.id),
    tz: tz(),
    now: new Date(),
    newId: uuid,
  });
  const ops: MutationInput[] = [{ table: "tasks", kind: "update", row: { id: task.id }, values: plan.complete.values }];
  if (plan.next) {
    const n = plan.next;
    ops.push({ table: "tasks", kind: "insert", row: n.task });
    for (const s of n.subtasks) ops.push({ table: "tasks", kind: "insert", row: s });
    for (const c of n.checklist) ops.push({ table: "checklist_items", kind: "insert", row: c });
    for (const l of n.labels) ops.push({ table: "task_labels", kind: "insert", row: l });
    for (const a of n.assignees) ops.push({ table: "task_assignees", kind: "insert", row: a });
    for (const r of n.reminders.filter((r) => r.user_id === uid())) ops.push({ table: "reminders", kind: "insert", row: r });
  }
  const inverse = mutate(ops);
  if (!opts.silent) {
    const msg = plan.next
      ? `${tr("task.completedToast", { title: task.title })} · ${tr("task.nextOccurrence", { date: plan.next.task.due_date ?? "" })}`
      : tr("task.completedToast", { title: task.title });
    undoToast(msg, inverse);
  }
}

export function deleteTasks(ids: string[]) {
  const ts = nowIso();
  const inverse = mutate(ids.map((id) => ({ table: "tasks" as const, kind: "update" as const, row: { id }, values: { deleted_at: ts } })));
  undoToast(ids.length === 1 ? tr("task.deletedToast") : tr("task.bulkDeleted", { count: ids.length }), inverse);
}

export function restoreTask(id: string) {
  mutate([{ table: "tasks", kind: "update", row: { id }, values: { deleted_at: null } }]);
}

export function deleteTaskForever(id: string) {
  mutate([{ table: "tasks", kind: "delete", row: { id } }]);
}

export function moveTasks(ids: string[], target: { projectId: string | null; sectionId?: string | null }) {
  const d = S().data;
  const project = target.projectId ? d.projects[target.projectId] : undefined;
  const ops: MutationInput[] = ids.map((id) => ({
    table: "tasks",
    kind: "update",
    row: { id },
    values: {
      project_id: target.projectId,
      section_id: target.sectionId ?? null,
      workspace_id: project?.workspace_id ?? d.tasks[id]?.workspace_id,
      parent_id: null,
    },
  }));
  const inverse = mutate(ops);
  undoToast(ids.length === 1 ? tr("task.movedToast") : tr("task.bulkMoved", { count: ids.length }), inverse);
}

export function rescheduleTasks(ids: string[], date: string | null) {
  const d = S().data;
  const ops: MutationInput[] = ids.map((id) => {
    const t = d.tasks[id];
    let due_at: string | null = null;
    if (date && t?.due_at) {
      const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: tz(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t.due_at));
      due_at = zonedToUtc(date, hhmm, tz()).toISOString();
    }
    const values: Partial<Task> = { due_date: date, due_at };
    if (date && t?.start_date && t.start_date > date) values.start_date = date;
    return { table: "tasks" as const, kind: "update" as const, row: { id }, values };
  });
  const inverse = mutate(ops);
  undoToast(tr("task.bulkRescheduled", { count: ids.length }), inverse);
}

export function completeTasks(ids: string[]) {
  const d = S().data;
  const tasks = ids.map((id) => d.tasks[id]).filter(Boolean);
  for (const t of tasks) toggleComplete(t, { silent: true });
  toast(tr("task.bulkCompleted", { count: tasks.length }));
}

function warnIfTopFull(date: string, exceptId: string) {
  const count = Object.values(S().data.tasks).filter(
    (t) => t.top_date === date && !t.deleted_at && t.status !== "cancelled" && t.id !== exceptId,
  ).length;
  if (count >= 3) toast.warning(tr("home.top3Full"));
}

export function setTop(task: Task, on: boolean, date = today()) {
  if (on) warnIfTopFull(date, task.id);
  mutate([{ table: "tasks", kind: "update", row: { id: task.id }, values: { top_date: on ? date : null } }]);
}

export function assign(task: Task, userId: string, on: boolean) {
  if (on) {
    mutate([{ table: "task_assignees", kind: "insert", row: { task_id: task.id, user_id: userId, workspace_id: task.workspace_id, created_at: nowIso() } }]);
  } else {
    mutate([{ table: "task_assignees", kind: "delete", row: { task_id: task.id, user_id: userId } }]);
  }
}

export function bulkAssign(ids: string[], userId: string) {
  const d = S().data;
  const existing = assigneesByTask(d.task_assignees);
  const ops: MutationInput[] = [];
  for (const id of ids) {
    const t = d.tasks[id];
    if (t && !(existing[id] ?? []).some((a) => a.user_id === userId)) {
      ops.push({ table: "task_assignees", kind: "insert", row: { task_id: id, user_id: userId, workspace_id: t.workspace_id, created_at: nowIso() } });
    }
  }
  const inverse = mutate(ops);
  undoToast(tr("task.bulkAssigned", { count: ids.length }), inverse);
}

export function toggleWatch(task: Task, on: boolean) {
  if (on) mutate([{ table: "task_watchers", kind: "insert", row: { task_id: task.id, user_id: uid(), workspace_id: task.workspace_id, created_at: nowIso() } }]);
  else mutate([{ table: "task_watchers", kind: "delete", row: { task_id: task.id, user_id: uid() } }]);
}

export function toggleLabel(task: Task, labelId: string, on: boolean) {
  if (on) mutate([{ table: "task_labels", kind: "insert", row: { task_id: task.id, label_id: labelId, workspace_id: task.workspace_id, created_at: nowIso() } }]);
  else mutate([{ table: "task_labels", kind: "delete", row: { task_id: task.id, label_id: labelId } }]);
}

export function bulkLabel(ids: string[], labelId: string) {
  const d = S().data;
  const existing = labelsByTask(d.task_labels);
  const ops: MutationInput[] = [];
  for (const id of ids) {
    const t = d.tasks[id];
    if (t && !(existing[id] ?? []).some((l) => l.label_id === labelId)) {
      ops.push({ table: "task_labels", kind: "insert", row: { task_id: id, label_id: labelId, workspace_id: t.workspace_id, created_at: nowIso() } });
    }
  }
  const inverse = mutate(ops);
  undoToast(tr("task.bulkLabeled", { count: ids.length }), inverse);
}

export function createLabel(workspaceId: string, name: string, color: string) {
  const label = newLabel({ workspace_id: workspaceId, name: name.trim(), color });
  mutate([{ table: "labels", kind: "insert", row: label }]);
  return label;
}

export function updateLabel(id: string, values: { name?: string; color?: string }) {
  mutate([{ table: "labels", kind: "update", row: { id }, values }]);
}

export function deleteLabel(id: string) {
  const inverse = mutate([{ table: "labels", kind: "update", row: { id }, values: { deleted_at: nowIso() } }]);
  undoToast(tr("common.deleted"), inverse);
}

// checklist
export function addChecklistItem(task: Task, text: string) {
  mutate([{ table: "checklist_items", kind: "insert", row: newChecklistItem({ task_id: task.id, workspace_id: task.workspace_id, text: text.trim() }) }]);
}
export function updateChecklistItem(id: string, values: { text?: string; done?: boolean; position?: number }) {
  mutate([{ table: "checklist_items", kind: "update", row: { id }, values }]);
}
export function deleteChecklistItem(id: string) {
  const inverse = mutate([{ table: "checklist_items", kind: "delete", row: { id } }]);
  undoToast(tr("common.deleted"), inverse);
}

// dependencies
export function addDependency(blockerId: string, blockedId: string, workspaceId: string) {
  if (blockerId === blockedId) return;
  mutate([{ table: "task_dependencies", kind: "insert", row: { blocker_id: blockerId, blocked_id: blockedId, workspace_id: workspaceId, created_at: nowIso() } }]);
}
export function removeDependency(blockerId: string, blockedId: string) {
  mutate([{ table: "task_dependencies", kind: "delete", row: { blocker_id: blockerId, blocked_id: blockedId } }]);
}

// reminders
export function addReminder(task: Task, offset: ReminderOffset, customAt?: Date) {
  let at: Date | null = null;
  if (offset === "custom") at = customAt ?? null;
  else at = computeRemindAt(task.due_date, task.due_at, tz(), offset);
  if (!at) {
    toast.error(tr("task.reminderNeedsDue"));
    return;
  }
  mutate([
    {
      table: "reminders",
      kind: "insert",
      row: newReminder({ user_id: uid(), task_id: task.id, workspace_id: task.workspace_id, remind_at: at.toISOString(), offset_rule: offset }),
    },
  ]);
}
export function removeReminder(id: string) {
  mutate([{ table: "reminders", kind: "update", row: { id }, values: { status: "dismissed" } }]);
}
export function addStandaloneReminder(title: string, at: Date) {
  mutate([{ table: "reminders", kind: "insert", row: newReminder({ user_id: uid(), title, remind_at: at.toISOString(), offset_rule: "custom" }) }]);
}

// time tracking
export function logTime(task: Task, minutes: number, startedAt = new Date()) {
  if (minutes < 1) return;
  mutate([
    {
      table: "time_entries",
      kind: "insert",
      row: newTimeEntry({ task_id: task.id, workspace_id: task.workspace_id, user_id: uid(), minutes: Math.round(minutes), started_at: startedAt.toISOString() }),
    },
  ]);
}

// comments
export function addComment(task: Task, body: RichDoc, text: string, mentions: string[]) {
  const c: Comment = newComment({ task_id: task.id, workspace_id: task.workspace_id, author_id: uid(), body, body_text: text, mentions });
  mutate([{ table: "comments", kind: "insert", row: c }]);
}
export function deleteComment(id: string) {
  const inverse = mutate([{ table: "comments", kind: "update", row: { id }, values: { deleted_at: nowIso() } }]);
  undoToast(tr("common.deleted"), inverse);
}
export function toggleReaction(comment: Comment, emoji: string) {
  const key = `${comment.id}|${uid()}|${emoji}`;
  if (S().data.comment_reactions[key]) {
    mutate([{ table: "comment_reactions", kind: "delete", row: { comment_id: comment.id, user_id: uid(), emoji } }]);
  } else {
    mutate([{ table: "comment_reactions", kind: "insert", row: { comment_id: comment.id, user_id: uid(), emoji, workspace_id: comment.workspace_id, created_at: nowIso() } }]);
  }
}

// attachments
export async function uploadAttachment(task: Task, file: File) {
  if (file.size > 25 * 1024 * 1024) {
    toast.error(tr("task.fileTooBig"));
    return;
  }
  const adapter = S().adapter;
  if (!adapter) return;
  const id = uuid();
  const safe = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-80);
  const path = `${task.workspace_id}/${task.id}/${id}-${safe}`;
  const t = toast.loading(tr("task.uploading"));
  try {
    await adapter.upload(path, file);
    mutate([
      {
        table: "attachments",
        kind: "insert",
        row: { id, workspace_id: task.workspace_id, task_id: task.id, comment_id: null, storage_path: path, name: file.name, size: file.size, mime: file.type || "application/octet-stream", uploaded_by: uid(), created_at: nowIso(), deleted_at: null },
      },
    ]);
    toast.success(file.name, { id: t });
  } catch (e) {
    toast.error(tr("errors.saveFailed", { message: (e as Error).message }), { id: t });
  }
}
export function deleteAttachment(id: string) {
  const inverse = mutate([{ table: "attachments", kind: "update", row: { id }, values: { deleted_at: nowIso() } }]);
  undoToast(tr("common.deleted"), inverse);
}

// ------------------------------------------------------------------ projects & sections

export function createProject(input: Partial<Project> & { name: string; workspace_id: string }, template?: { sections: string[]; tasks: TemplateTask[] }): Project {
  const project = newProject({ ...input, owner_id: uid(), name: input.name.trim() });
  const ops: MutationInput[] = [{ table: "projects", kind: "insert", row: project }];
  if (template) {
    const sectionIds = new Map<string, string>();
    template.sections.forEach((name, i) => {
      const s = newSection({ project_id: project.id, workspace_id: project.workspace_id, name, position: i + 1 });
      sectionIds.set(name, s.id);
      ops.push({ table: "sections", kind: "insert", row: s });
    });
    const start = project.start_date ?? today();
    const addTask = (tt: TemplateTask, parentId: string | null, pos: number) => {
      const task = newTask({
        workspace_id: project.workspace_id,
        project_id: project.id,
        parent_id: parentId,
        section_id: tt.section ? (sectionIds.get(tt.section) ?? null) : null,
        title: tt.title,
        priority: tt.priority ?? "none",
        estimate_min: tt.estimate_min ?? null,
        due_date: tt.due_offset_days === null || tt.due_offset_days === undefined ? null : addDays(start, tt.due_offset_days),
        created_by: uid(),
        position: pos,
      });
      ops.push({ table: "tasks", kind: "insert", row: task });
      tt.checklist?.forEach((text, i) =>
        ops.push({ table: "checklist_items", kind: "insert", row: newChecklistItem({ task_id: task.id, workspace_id: task.workspace_id, text, position: i }) }),
      );
      tt.subtasks?.forEach((st, i) => addTask(st, task.id, i));
    };
    template.tasks.forEach((tt, i) => addTask(tt, null, i + 1));
  }
  mutate(ops);
  return project;
}

export function updateProject(id: string, values: Partial<Project>) {
  return mutate([{ table: "projects", kind: "update", row: { id }, values }]);
}

export function deleteProject(project: Project) {
  const inverse = mutate([{ table: "projects", kind: "update", row: { id: project.id }, values: { deleted_at: nowIso() } }]);
  undoToast(tr("common.deleted"), inverse);
}

export function restoreProject(id: string) {
  mutate([{ table: "projects", kind: "update", row: { id }, values: { deleted_at: null } }]);
}

export function toggleFavorite(project: Project, on: boolean) {
  if (on) mutate([{ table: "project_favorites", kind: "insert", row: { user_id: uid(), project_id: project.id, position: Date.now(), created_at: nowIso() } }]);
  else mutate([{ table: "project_favorites", kind: "delete", row: { user_id: uid(), project_id: project.id } }]);
}

export function createSection(project: Project, name: string, position = Date.now()): Section {
  const s = newSection({ project_id: project.id, workspace_id: project.workspace_id, name: name.trim(), position });
  mutate([{ table: "sections", kind: "insert", row: s }]);
  return s;
}

export function updateSection(id: string, values: Partial<Section>) {
  mutate([{ table: "sections", kind: "update", row: { id }, values }]);
}

export function deleteSection(section: Section) {
  const d = S().data;
  const ops: MutationInput[] = Object.values(d.tasks)
    .filter((t) => t.section_id === section.id)
    .map((t) => ({ table: "tasks" as const, kind: "update" as const, row: { id: t.id }, values: { section_id: null } }));
  ops.push({ table: "sections", kind: "update", row: { id: section.id }, values: { deleted_at: nowIso() } });
  const inverse = mutate(ops);
  undoToast(tr("common.deleted"), inverse);
}

// ------------------------------------------------------------------ notes, goals

export function createNote(project: Project): Note {
  const note = newNote({ workspace_id: project.workspace_id, project_id: project.id, created_by: uid() });
  mutate([{ table: "notes", kind: "insert", row: note }]);
  return note;
}
export function updateNote(id: string, values: Partial<Note>) {
  mutate([{ table: "notes", kind: "update", row: { id }, values }]);
}
export function deleteNote(id: string) {
  const inverse = mutate([{ table: "notes", kind: "update", row: { id }, values: { deleted_at: nowIso() } }]);
  undoToast(tr("common.deleted"), inverse);
}

export function createGoal(input: Partial<Goal> & { workspace_id: string; title: string }, krs: Partial<KeyResult>[] = []): Goal {
  const goal = newGoal({ ...input, owner_id: uid() });
  const ops: MutationInput[] = [{ table: "goals", kind: "insert", row: goal }];
  krs.forEach((kr, i) =>
    ops.push({
      table: "key_results",
      kind: "insert",
      row: newKeyResult({ ...kr, goal_id: goal.id, workspace_id: goal.workspace_id, title: kr.title ?? "", target: kr.target ?? 1, position: i }),
    }),
  );
  mutate(ops);
  return goal;
}
export function updateGoal(id: string, values: Partial<Goal>) {
  mutate([{ table: "goals", kind: "update", row: { id }, values }]);
}
export function deleteGoal(id: string) {
  const inverse = mutate([{ table: "goals", kind: "update", row: { id }, values: { deleted_at: nowIso() } }]);
  undoToast(tr("common.deleted"), inverse);
}
export function addKeyResult(goal: Goal, kr: { title: string; target: number; start_value?: number; unit?: string | null }) {
  mutate([{ table: "key_results", kind: "insert", row: newKeyResult({ ...kr, goal_id: goal.id, workspace_id: goal.workspace_id, current: kr.start_value ?? 0 }) }]);
}
export function updateKeyResult(kr: KeyResult, values: Partial<KeyResult>) {
  const ops: MutationInput[] = [{ table: "key_results", kind: "update", row: { id: kr.id }, values }];
  if (values.current !== undefined && values.current !== kr.current) {
    ops.push({
      table: "key_result_history",
      kind: "insert",
      row: { id: uuid(), key_result_id: kr.id, workspace_id: kr.workspace_id, value: values.current, recorded_by: uid(), recorded_at: nowIso() },
    });
  }
  mutate(ops);
}
export function deleteKeyResult(id: string) {
  mutate([{ table: "key_results", kind: "delete", row: { id } }]);
}

// ------------------------------------------------------------------ personal

export function createHabit(name: string, color: string, days: number[]): Habit {
  const h = newHabit({ user_id: uid(), name: name.trim(), color, days });
  mutate([{ table: "habits", kind: "insert", row: h }]);
  return h;
}
export function updateHabit(id: string, values: Partial<Habit>) {
  mutate([{ table: "habits", kind: "update", row: { id }, values }]);
}
export function toggleHabit(habitId: string, date: string) {
  const key = `${habitId}|${date}`;
  if (S().data.habit_logs[key]) mutate([{ table: "habit_logs", kind: "delete", row: { habit_id: habitId, date } }]);
  else mutate([{ table: "habit_logs", kind: "insert", row: { habit_id: habitId, date, user_id: uid(), created_at: nowIso() } }]);
}

export function createTimeBlock(input: { date: string; start: string; end: string; taskId?: string | null; title?: string | null; color?: string | null }): TimeBlock {
  const b = newTimeBlock({
    user_id: uid(),
    date: input.date,
    start_at: zonedToUtc(input.date, input.start, tz()).toISOString(),
    end_at: zonedToUtc(input.date, input.end, tz()).toISOString(),
    task_id: input.taskId ?? null,
    title: input.title ?? null,
    color: input.color ?? null,
  });
  mutate([{ table: "time_blocks", kind: "insert", row: b }]);
  return b;
}
export function updateTimeBlock(id: string, values: Partial<TimeBlock>) {
  mutate([{ table: "time_blocks", kind: "update", row: { id }, values }]);
}
export function deleteTimeBlock(id: string) {
  const inverse = mutate([{ table: "time_blocks", kind: "delete", row: { id } }]);
  undoToast(tr("common.deleted"), inverse);
}

// ------------------------------------------------------------------ notifications

export function markRead(id: string) {
  mutate([{ table: "notifications", kind: "update", row: { id }, values: { read_at: nowIso() } }]);
}
export function markAllRead() {
  const ts = nowIso();
  const ops = Object.values(S().data.notifications)
    .filter((n) => n.user_id === uid() && !n.read_at)
    .map((n) => ({ table: "notifications" as const, kind: "update" as const, row: { id: n.id }, values: { read_at: ts } }));
  if (ops.length) mutate(ops);
}

// ------------------------------------------------------------------ profile & workspaces

export function updateProfile(values: Partial<Profile>) {
  const allowed: Partial<Profile> = {};
  for (const k of PROFILE_EDITABLE) if (k in values) (allowed as Record<string, unknown>)[k] = (values as Record<string, unknown>)[k];
  if (Object.keys(allowed).length === 0) return;
  mutate([{ table: "profiles", kind: "update", row: { id: uid() }, values: allowed }]);
}

export function switchWorkspace(id: string) {
  updateProfile({ current_workspace_id: id });
}

export function createWorkspace(name: string, color = "indigo"): Workspace {
  const ws = newWorkspace({ name: name.trim(), owner_id: uid(), color });
  mutate([
    { table: "workspaces", kind: "insert", row: ws },
    { table: "workspace_members", kind: "insert", row: { workspace_id: ws.id, user_id: uid(), role: "owner", created_at: nowIso() } },
  ]);
  // the membership row is created by a trigger on the server; skip sending ours
  useStore.setState((s) => ({ outbox: s.outbox.filter((o) => !(o.table === "workspace_members" && o.key.workspace_id === ws.id)) }));
  switchWorkspace(ws.id);
  return ws;
}

export function updateWorkspace(id: string, values: Partial<Workspace>) {
  mutate([{ table: "workspaces", kind: "update", row: { id }, values }]);
}

// ------------------------------------------------------------------ import

/** Create the projects and tasks of an import plan in one optimistic batch. */
export function runImport(plan: import("@/lib/import/planner").ImportPlan, workspaceId: string): number {
  const projectIds: Record<string, string> = { ...plan.existing };
  const ops: MutationInput[] = [];
  let pos = Date.now();
  for (const p of plan.newProjects) {
    const project = newProject({ workspace_id: workspaceId, name: p.name, color: p.color, owner_id: uid(), position: pos++ });
    projectIds[p.key] = project.id;
    ops.push({ table: "projects", kind: "insert", row: project });
  }
  for (const t of plan.tasks) {
    const projectId = t.projectKey ? (projectIds[t.projectKey] ?? null) : null;
    const project = projectId ? S().data.projects[projectId] : undefined;
    const task = newTask({
      workspace_id: project?.workspace_id ?? workspaceId,
      project_id: projectId,
      title: t.title,
      priority: t.priority,
      status: t.status,
      completed_at: t.status === "done" ? nowIso() : null,
      due_date: t.dueDate,
      deadline: t.deadline,
      top_date: t.topDate,
      description: t.note ? { type: "doc", content: t.note.split(/\n+/).map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })) } : null,
      created_by: uid(),
      source: "import",
      position: pos++,
    });
    ops.push({ table: "tasks", kind: "insert", row: task });
  }
  mutate(ops);
  return plan.tasks.length;
}
