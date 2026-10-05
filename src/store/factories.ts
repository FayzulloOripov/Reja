// Builders for optimistic rows. They fill every column the database would default, so the
// local copy is complete before the server echoes it back.

import type {
  ChecklistItem,
  Comment,
  Goal,
  Habit,
  KeyResult,
  Label,
  Note,
  Project,
  Reminder,
  SavedView,
  Section,
  Task,
  Template,
  TimeBlock,
  TimeEntry,
  Workspace,
} from "@/lib/types";

export const uuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
      );

const now = () => new Date().toISOString();

export function newTask(p: Partial<Task> & Pick<Task, "workspace_id" | "title">): Task {
  return {
    id: uuid(),
    project_id: null,
    section_id: null,
    parent_id: null,
    description: null,
    status: "todo",
    priority: "none",
    start_date: null,
    due_date: null,
    due_at: null,
    deadline: null,
    estimate_min: null,
    recurrence: null,
    top_date: null,
    position: Date.now(),
    completed_at: null,
    created_by: null,
    source: null,
    created_at: now(),
    updated_at: now(),
    deleted_at: null,
    ...p,
  };
}

export function newProject(p: Partial<Project> & Pick<Project, "workspace_id" | "name">): Project {
  return {
    id: uuid(),
    description: null,
    color: "sky",
    icon: null,
    area: null,
    status: "active",
    visibility: "workspace",
    start_date: null,
    target_date: null,
    goal: null,
    health: null,
    health_manual: false,
    owner_id: null,
    position: Date.now(),
    share_token: null,
    telegram_chat_id: null,
    telegram_link_code: null,
    created_at: now(),
    updated_at: now(),
    deleted_at: null,
    ...p,
  };
}

export function newWorkspace(p: Partial<Workspace> & Pick<Workspace, "name" | "owner_id">): Workspace {
  return {
    id: uuid(),
    icon: null,
    color: "tangerine",
    is_personal: false,
    created_at: now(),
    updated_at: now(),
    deleted_at: null,
    ...p,
  };
}

export function newSection(p: Partial<Section> & Pick<Section, "project_id" | "workspace_id" | "name">): Section {
  return { id: uuid(), position: Date.now(), created_at: now(), updated_at: now(), deleted_at: null, ...p };
}

export function newLabel(p: Partial<Label> & Pick<Label, "workspace_id" | "name">): Label {
  return { id: uuid(), color: "sky", created_at: now(), updated_at: now(), deleted_at: null, ...p };
}

export function newChecklistItem(p: Partial<ChecklistItem> & Pick<ChecklistItem, "task_id" | "workspace_id" | "text">): ChecklistItem {
  return { id: uuid(), done: false, position: Date.now(), created_at: now(), updated_at: now(), ...p };
}

export function newComment(p: Partial<Comment> & Pick<Comment, "task_id" | "workspace_id" | "author_id" | "body" | "body_text">): Comment {
  return { id: uuid(), mentions: [], created_at: now(), updated_at: now(), deleted_at: null, ...p };
}

export function newReminder(p: Partial<Reminder> & Pick<Reminder, "user_id" | "remind_at">): Reminder {
  return {
    id: uuid(),
    workspace_id: null,
    task_id: null,
    title: null,
    offset_rule: "custom",
    is_auto: false,
    channels: ["in_app", "telegram", "push"],
    status: "pending",
    attempts: 0,
    claimed_at: null,
    sent_at: null,
    last_error: null,
    created_at: now(),
    updated_at: now(),
    ...p,
  };
}

export function newGoal(p: Partial<Goal> & Pick<Goal, "workspace_id" | "title">): Goal {
  return {
    id: uuid(),
    project_id: null,
    description: null,
    owner_id: null,
    target_date: null,
    status: "active",
    color: "violet",
    created_at: now(),
    updated_at: now(),
    deleted_at: null,
    ...p,
  };
}

export function newKeyResult(p: Partial<KeyResult> & Pick<KeyResult, "goal_id" | "workspace_id" | "title" | "target">): KeyResult {
  return { id: uuid(), start_value: 0, current: 0, unit: null, position: Date.now(), created_at: now(), updated_at: now(), ...p };
}

export function newNote(p: Partial<Note> & Pick<Note, "workspace_id" | "project_id">): Note {
  return { id: uuid(), title: "", content: null, position: Date.now(), created_by: null, created_at: now(), updated_at: now(), deleted_at: null, ...p };
}

export function newHabit(p: Partial<Habit> & Pick<Habit, "user_id" | "name">): Habit {
  return {
    id: uuid(),
    icon: null,
    color: "emerald",
    days: [1, 2, 3, 4, 5, 6, 7],
    position: Date.now(),
    archived_at: null,
    created_at: now(),
    updated_at: now(),
    ...p,
  };
}

export function newTimeBlock(p: Partial<TimeBlock> & Pick<TimeBlock, "user_id" | "date" | "start_at" | "end_at">): TimeBlock {
  return { id: uuid(), task_id: null, title: null, color: null, created_at: now(), updated_at: now(), ...p };
}

export function newTimeEntry(p: Partial<TimeEntry> & Pick<TimeEntry, "task_id" | "workspace_id" | "user_id" | "minutes">): TimeEntry {
  return { id: uuid(), started_at: now(), note: null, created_at: now(), ...p };
}

export function newSavedView(p: Partial<SavedView> & Pick<SavedView, "workspace_id" | "name">): SavedView {
  return {
    id: uuid(),
    user_id: null,
    project_id: null,
    view_type: "list",
    filters: {},
    sort: {},
    grouping: null,
    created_by: null,
    created_at: now(),
    updated_at: now(),
    ...p,
  };
}

export function newTemplate(p: Partial<Template> & Pick<Template, "workspace_id" | "name" | "kind" | "data">): Template {
  return { id: uuid(), description: null, created_by: null, created_at: now(), updated_at: now(), ...p };
}
