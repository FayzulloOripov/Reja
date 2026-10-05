import type {
  ActivityEntry,
  Area,
  Attachment,
  ChecklistItem,
  Comment,
  CommentReaction,
  Goal,
  Habit,
  HabitLog,
  Invitation,
  KeyResult,
  KeyResultHistory,
  Label,
  Note,
  Notification,
  Profile,
  Project,
  ProjectFavorite,
  ProjectMember,
  Reminder,
  SavedView,
  Section,
  Task,
  TaskAssignee,
  TaskDependency,
  TaskLabel,
  TaskWatcher,
  Template,
  TimeBlock,
  TimeEntry,
  Workspace,
  WorkspaceMember,
} from "@/lib/types";

export interface Tables {
  profiles: Profile;
  workspaces: Workspace;
  workspace_members: WorkspaceMember;
  invitations: Invitation;
  areas: Area;
  projects: Project;
  project_members: ProjectMember;
  project_favorites: ProjectFavorite;
  sections: Section;
  tasks: Task;
  task_assignees: TaskAssignee;
  task_watchers: TaskWatcher;
  task_dependencies: TaskDependency;
  labels: Label;
  task_labels: TaskLabel;
  checklist_items: ChecklistItem;
  comments: Comment;
  comment_reactions: CommentReaction;
  attachments: Attachment;
  time_entries: TimeEntry;
  reminders: Reminder;
  notifications: Notification;
  activity_log: ActivityEntry;
  goals: Goal;
  key_results: KeyResult;
  key_result_history: KeyResultHistory;
  notes: Note;
  habits: Habit;
  habit_logs: HabitLog;
  time_blocks: TimeBlock;
  saved_views: SavedView;
  templates: Template;
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T];

/** Primary key columns per table. */
export const PK: { [T in TableName]: (keyof Tables[T] & string)[] } = {
  profiles: ["id"],
  workspaces: ["id"],
  workspace_members: ["workspace_id", "user_id"],
  invitations: ["id"],
  areas: ["id"],
  projects: ["id"],
  project_members: ["project_id", "user_id"],
  project_favorites: ["user_id", "project_id"],
  sections: ["id"],
  tasks: ["id"],
  task_assignees: ["task_id", "user_id"],
  task_watchers: ["task_id", "user_id"],
  task_dependencies: ["blocker_id", "blocked_id"],
  labels: ["id"],
  task_labels: ["task_id", "label_id"],
  checklist_items: ["id"],
  comments: ["id"],
  comment_reactions: ["comment_id", "user_id", "emoji"],
  attachments: ["id"],
  time_entries: ["id"],
  reminders: ["id"],
  notifications: ["id"],
  activity_log: ["id"],
  goals: ["id"],
  key_results: ["id"],
  key_result_history: ["id"],
  notes: ["id"],
  habits: ["id"],
  habit_logs: ["habit_id", "date"],
  time_blocks: ["id"],
  saved_views: ["id"],
  templates: ["id"],
};

export const TABLE_NAMES = Object.keys(PK) as TableName[];

/** Columns a signed-in user may update on their own profile (mirrors the column GRANT). */
export const PROFILE_EDITABLE = [
  "name",
  "avatar_url",
  "timezone",
  "language",
  "theme",
  "work_days",
  "quiet_enabled",
  "quiet_start",
  "quiet_end",
  "digest_enabled",
  "digest_time",
  "review_enabled",
  "review_dow",
  "review_time",
  "overdue_nudge_enabled",
  "default_reminder",
  "notify_prefs",
  "onboarded_at",
  "current_workspace_id",
  "pomodoro_work",
  "pomodoro_break",
  "work_start",
  "work_end",
  "day_start",
  "day_end",
  "daily_capacity_tasks",
  "daily_capacity_minutes",
] as const;

export type StoreData = { [T in TableName]: Record<string, Row<T>> };

export function emptyData(): StoreData {
  const d = {} as StoreData;
  for (const t of TABLE_NAMES) (d as Record<string, unknown>)[t] = {};
  return d;
}

export function keyOf<T extends TableName>(table: T, row: Partial<Row<T>>): string {
  return PK[table].map((c) => String((row as Record<string, unknown>)[c] ?? "")).join("|");
}

export function pkOf<T extends TableName>(table: T, row: Partial<Row<T>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of PK[table]) out[c] = String((row as Record<string, unknown>)[c]);
  return out;
}

export interface Op {
  opId: string;
  table: TableName;
  kind: "insert" | "update" | "delete";
  key: Record<string, string>;
  values?: Record<string, unknown>;
  ts: number;
  /** row before the op, for rollback (not sent to the server) */
  prev?: Record<string, unknown> | null;
}

export interface ChangeEvent {
  table: TableName;
  type: "INSERT" | "UPDATE" | "DELETE";
  row?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public network = false,
    public code?: string,
  ) {
    super(message);
  }
}

export interface DataAdapter {
  kind: "supabase" | "demo";
  loadAll(userId: string): Promise<Partial<StoreData>>;
  exec(op: Op): Promise<void>;
  subscribe(userId: string, workspaceIds: string[], onChange: (e: ChangeEvent) => void): () => void;
  loadTaskDetail(taskId: string): Promise<Partial<StoreData>>;
  loadActivity(scope: { workspaceId?: string; projectId?: string; taskId?: string }, limit?: number): Promise<ActivityEntry[]>;
  loadTrash(workspaceIds: string[]): Promise<Partial<StoreData>>;
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
  upload(path: string, file: File): Promise<void>;
  fileUrl(path: string): Promise<string | null>;
  removeFile(path: string): Promise<void>;
}
