// Row types mirroring supabase/migrations. Dates are ISO strings as returned by PostgREST:
// `date` columns → "YYYY-MM-DD", `timestamptz` → ISO 8601, `time` → "HH:MM:SS".

export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;
export type TimeOfDay = string; // HH:MM or HH:MM:SS

export type WorkspaceRole = "owner" | "admin" | "member" | "guest";
export type ProjectRole = "manager" | "member" | "viewer";
export type ProjectStatus = "active" | "paused" | "done" | "archived";
export type ProjectHealth = "on_track" | "at_risk" | "off_track";
export type TaskStatus = "todo" | "in_progress" | "waiting" | "done" | "cancelled";
export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";
export type ReminderOffset = "at_due" | "15m" | "1h" | "1d" | "custom";
export type ReminderStatus = "pending" | "sending" | "sent" | "snoozed" | "dismissed" | "failed";
export type NotificationType =
  | "assigned"
  | "mentioned"
  | "due_soon"
  | "overdue"
  | "comment"
  | "status_change"
  | "invite"
  | "reminder";
export type Channel = "in_app" | "telegram" | "push" | "email";
export type Language = "uz" | "en";

/** TipTap JSON document. */
export type RichDoc = { type: "doc"; content?: unknown[] } | null;

export type NotifyPrefs = Record<Channel, Partial<Record<NotificationType | "digest" | "review", boolean>>>;

export interface Profile {
  id: UUID;
  email: string | null;
  name: string;
  avatar_url: string | null;
  timezone: string;
  language: Language;
  theme: "system" | "light" | "dark";
  work_days: number[];
  quiet_enabled: boolean;
  quiet_start: TimeOfDay;
  quiet_end: TimeOfDay;
  digest_enabled: boolean;
  digest_time: TimeOfDay;
  review_enabled: boolean;
  review_dow: number;
  review_time: TimeOfDay;
  overdue_nudge_enabled: boolean;
  default_reminder: "none" | "at_due" | "15m" | "1h" | "1d";
  notify_prefs: NotifyPrefs;
  telegram_chat_id: number | null;
  telegram_username: string | null;
  ics_token: string | null;
  onboarded_at: ISODateTime | null;
  current_workspace_id: UUID | null;
  pomodoro_work: number;
  pomodoro_break: number;
  last_digest_on: ISODate | null;
  last_review_on: ISODate | null;
  last_overdue_nudge_on: ISODate | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Workspace {
  id: UUID;
  name: string;
  icon: string | null;
  color: string;
  owner_id: UUID;
  is_personal: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface WorkspaceMember {
  workspace_id: UUID;
  user_id: UUID;
  role: WorkspaceRole;
  created_at: ISODateTime;
}

export interface Invitation {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID | null;
  email: string | null;
  role: "admin" | "member" | "guest" | "manager" | "viewer";
  token: string;
  created_by: UUID;
  expires_at: ISODateTime;
  max_uses: number | null;
  use_count: number;
  accepted_at: ISODateTime | null;
  accepted_by: UUID | null;
  revoked_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface Project {
  id: UUID;
  workspace_id: UUID;
  name: string;
  description: RichDoc;
  color: string;
  icon: string | null;
  area: string | null;
  status: ProjectStatus;
  visibility: "workspace" | "private";
  start_date: ISODate | null;
  target_date: ISODate | null;
  goal: string | null;
  health: ProjectHealth | null;
  health_manual: boolean;
  /** why the owner set the health manually */
  health_note: string | null;
  owner_id: UUID | null;
  position: number;
  share_token: string | null;
  telegram_chat_id: number | null;
  telegram_link_code: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface ProjectMember {
  project_id: UUID;
  user_id: UUID;
  workspace_id: UUID;
  role: ProjectRole;
  created_at: ISODateTime;
}

export interface ProjectFavorite {
  user_id: UUID;
  project_id: UUID;
  position: number;
  created_at: ISODateTime;
}

export interface Section {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID;
  name: string;
  position: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface Task {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID | null;
  section_id: UUID | null;
  parent_id: UUID | null;
  title: string;
  description: RichDoc;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: ISODate | null;
  due_date: ISODate | null;
  due_at: ISODateTime | null;
  deadline: ISODate | null;
  estimate_min: number | null;
  recurrence: string | null;
  /** the occurrence this one was generated from when a recurring task was completed */
  recurrence_parent_id: UUID | null;
  top_date: ISODate | null;
  position: number;
  completed_at: ISODateTime | null;
  created_by: UUID | null;
  source: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface TaskAssignee {
  task_id: UUID;
  user_id: UUID;
  workspace_id: UUID;
  created_at: ISODateTime;
}
export type TaskWatcher = TaskAssignee;

export interface TaskDependency {
  blocker_id: UUID;
  blocked_id: UUID;
  workspace_id: UUID;
  created_at: ISODateTime;
}

export interface Label {
  id: UUID;
  workspace_id: UUID;
  name: string;
  color: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface TaskLabel {
  task_id: UUID;
  label_id: UUID;
  workspace_id: UUID;
  created_at: ISODateTime;
}

export interface ChecklistItem {
  id: UUID;
  task_id: UUID;
  workspace_id: UUID;
  text: string;
  done: boolean;
  position: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Comment {
  id: UUID;
  task_id: UUID;
  workspace_id: UUID;
  author_id: UUID;
  body: RichDoc;
  body_text: string;
  mentions: UUID[];
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface CommentReaction {
  comment_id: UUID;
  user_id: UUID;
  emoji: string;
  workspace_id: UUID;
  created_at: ISODateTime;
}

export interface Attachment {
  id: UUID;
  workspace_id: UUID;
  task_id: UUID;
  comment_id: UUID | null;
  storage_path: string;
  name: string;
  size: number;
  mime: string;
  uploaded_by: UUID | null;
  created_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface TimeEntry {
  id: UUID;
  /** null for a focus session without a task */
  task_id: UUID | null;
  workspace_id: UUID;
  user_id: UUID;
  started_at: ISODateTime;
  minutes: number;
  note: string | null;
  /** "focus" = a finished focus session; "manual" = time logged by hand or a stopped session */
  source: "manual" | "focus";
  created_at: ISODateTime;
}

export interface Reminder {
  id: UUID;
  user_id: UUID;
  workspace_id: UUID | null;
  task_id: UUID | null;
  title: string | null;
  remind_at: ISODateTime;
  offset_rule: ReminderOffset;
  is_auto: boolean;
  channels: Channel[];
  status: ReminderStatus;
  attempts: number;
  claimed_at: ISODateTime | null;
  sent_at: ISODateTime | null;
  last_error: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Notification {
  id: UUID;
  user_id: UUID;
  workspace_id: UUID | null;
  type: NotificationType;
  actor_id: UUID | null;
  task_id: UUID | null;
  project_id: UUID | null;
  title: string;
  body: string | null;
  url: string | null;
  data: Record<string, unknown>;
  read_at: ISODateTime | null;
  delivery: "pending" | "sending" | "done" | "skipped";
  deliver_after: ISODateTime;
  created_at: ISODateTime;
}

export interface ActivityEntry {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID | null;
  task_id: UUID | null;
  actor_id: UUID | null;
  entity_type: string;
  entity_id: UUID | null;
  action: string;
  diff: Record<string, unknown>;
  created_at: ISODateTime;
}

export interface Goal {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID | null;
  title: string;
  description: string | null;
  owner_id: UUID | null;
  start_date: ISODate | null;
  target_date: ISODate | null;
  status: "active" | "achieved" | "missed" | "archived";
  color: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface KeyResult {
  id: UUID;
  goal_id: UUID;
  workspace_id: UUID;
  title: string;
  start_value: number;
  target: number;
  current: number;
  unit: string | null;
  position: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface KeyResultHistory {
  id: UUID;
  key_result_id: UUID;
  workspace_id: UUID;
  value: number;
  recorded_by: UUID | null;
  recorded_at: ISODateTime;
}

export interface Note {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID;
  title: string;
  content: RichDoc;
  position: number;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface Habit {
  id: UUID;
  user_id: UUID;
  name: string;
  icon: string | null;
  color: string;
  days: number[];
  position: number;
  archived_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface HabitLog {
  habit_id: UUID;
  user_id: UUID;
  date: ISODate;
  created_at: ISODateTime;
}

export interface TimeBlock {
  id: UUID;
  user_id: UUID;
  date: ISODate;
  start_at: ISODateTime;
  end_at: ISODateTime;
  task_id: UUID | null;
  title: string | null;
  color: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface SavedView {
  id: UUID;
  workspace_id: UUID;
  user_id: UUID | null;
  project_id: UUID | null;
  name: string;
  view_type: string;
  filters: TaskFilters;
  sort: { field?: string; dir?: "asc" | "desc" };
  grouping: string | null;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Template {
  id: UUID;
  workspace_id: UUID;
  kind: "project" | "task";
  name: string;
  description: string | null;
  data: ProjectTemplateData | TaskTemplateData;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface TemplateTask {
  title: string;
  section?: string | null;
  priority?: TaskPriority;
  /** days after the project start date; null = no date */
  due_offset_days?: number | null;
  estimate_min?: number | null;
  checklist?: string[];
  subtasks?: TemplateTask[];
}

export interface ProjectTemplateData {
  color?: string;
  icon?: string | null;
  sections: string[];
  tasks: TemplateTask[];
}

export interface TaskTemplateData {
  task: TemplateTask;
}

export interface TaskFilters {
  assignees?: UUID[];
  labels?: UUID[];
  priorities?: TaskPriority[];
  statuses?: TaskStatus[];
  projects?: UUID[];
  due?: "overdue" | "today" | "week" | "none" | "any" | null;
  search?: string;
  showDone?: boolean;
}
