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
  /** working hours (wizard default 10:00–19:00) and the visible day on timelines */
  work_start: string;
  work_end: string;
  day_start: string;
  day_end: string;
  /** optional daily capacity for the workload view */
  daily_capacity_tasks: number | null;
  daily_capacity_minutes: number | null;
  pomodoro_work: number;
  pomodoro_break: number;
  /** end-of-day shutdown ritual */
  shutdown_enabled: boolean;
  shutdown_time: TimeOfDay;
  last_shutdown_on: ISODate | null;
  /** prayer-aware planning (off by default) */
  prayer_enabled: boolean;
  prayer_city: string | null;
  prayer_lat: number | null;
  prayer_lng: number | null;
  prayer_madhab: "hanafi" | "shafi";
  prayer_minutes: number;
  /** weekly JSON backup by email (owners of workspaces) */
  backup_enabled: boolean;
  last_backup_on: ISODate | null;
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
  /** business modules switched on for this workspace */
  modules: WorkspaceModules;
  /** UZS for one USD */
  usd_rate: number;
  /** expenses at or above this (UZS) need another partner's approval; null = never */
  approval_threshold_uzs: number | null;
  money_split: MoneySplit | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface WorkspaceModules {
  pipeline: boolean;
  money: boolean;
  docs: boolean;
}

/** Partner split: direct costs first, then fund_pct % to a common fund, the rest by shares (%). */
export interface MoneySplit {
  fund_pct: number;
  shares: Record<UUID, number>;
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
  /** legacy free-text area (kept for old exports); areas are rows now */
  area: string | null;
  area_id: UUID | null;
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

export interface Area {
  id: UUID;
  workspace_id: UUID;
  name: string;
  color: string;
  icon: string | null;
  visibility: "workspace" | "private";
  owner_id: UUID;
  position: number;
  archived_at: ISODateTime | null;
  deleted_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
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
  /** waiting-for: a teammate or an outside contact, since when, and when to chase */
  waiting_on_user_id: UUID | null;
  waiting_on_contact_id: UUID | null;
  waiting_since: ISODate | null;
  follow_up_date: ISODate | null;
  /** «chuqur ish» (deep work) or «tez ish» (quick task) */
  energy: "deep" | "quick" | null;
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
  /** where the current value comes from: manual check-ins or live data */
  source: KeyResultSource;
  /** label for tasks_done; project to narrow money/pipeline; scale divides money (1 000 000 → "mln soʻm") */
  source_config: { label_id?: UUID; project_id?: UUID; scale?: number };
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type KeyResultSource = "manual" | "money_income" | "pipeline_won" | "tasks_done";

export interface KeyResultHistory {
  id: UUID;
  key_result_id: UUID;
  workspace_id: UUID;
  value: number;
  note: string | null;
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
  /** mirror this block to Google Calendar */
  sync_google: boolean;
  google_event_id: string | null;
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

/** Someone without an account: a client's CTO, a supplier. Shared with the workspace's full members. */
export interface Contact {
  id: UUID;
  workspace_id: UUID;
  name: string;
  phone: string | null;
  telegram: string | null;
  company: string | null;
  note: string | null;
  created_by: UUID | null;
  deleted_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Meeting {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID | null;
  title: string;
  starts_at: ISODateTime;
  duration_min: number;
  location: string | null;
  notes: RichDoc;
  recurrence: string | null;
  template_key: string | null;
  series_id: UUID | null;
  finished_at: ISODateTime | null;
  created_by: UUID | null;
  deleted_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface MeetingAttendee {
  id: UUID;
  meeting_id: UUID;
  workspace_id: UUID;
  user_id: UUID | null;
  contact_id: UUID | null;
  created_at: ISODateTime;
}

export interface MeetingItem {
  id: UUID;
  meeting_id: UUID;
  workspace_id: UUID;
  kind: "agenda" | "decision";
  text: string;
  task_id: UUID | null;
  done: boolean;
  position: number;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface WeeklyReviewData {
  step?: number;
  wins?: string;
  lessons?: string;
  focus?: string;
  stats?: { done: number; overdue: number; minutes: number };
}

export interface WeeklyReview {
  id: UUID;
  user_id: UUID;
  week_start: ISODate;
  data: WeeklyReviewData;
  completed_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface DailyShutdownData {
  done?: number;
  moved?: number;
  tomorrow?: string[];
  note?: string;
}

export interface DailyShutdown {
  id: UUID;
  user_id: UUID;
  date: ISODate;
  data: DailyShutdownData;
  completed_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface RoutineItem {
  id: string;
  text: string;
}

export interface Routine {
  id: UUID;
  workspace_id: UUID;
  owner_id: UUID;
  name: string;
  items: RoutineItem[];
  recurrence: string;
  visibility: "private" | "workspace";
  color: string;
  position: number;
  archived_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface RoutineRun {
  id: UUID;
  routine_id: UUID;
  workspace_id: UUID;
  user_id: UUID;
  date: ISODate;
  checked: string[];
  completed_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type Currency = "UZS" | "USD";

export interface DealStage {
  id: UUID;
  workspace_id: UUID;
  name: string;
  kind: "open" | "won" | "lost";
  color: string;
  position: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Deal {
  id: UUID;
  workspace_id: UUID;
  stage_id: UUID;
  title: string;
  value: number | null;
  currency: Currency;
  owner_id: UUID | null;
  contact_id: UUID | null;
  source: string | null;
  next_step: string | null;
  next_step_date: ISODate | null;
  lost_reason: string | null;
  project_id: UUID | null;
  position: number;
  stage_changed_at: ISODateTime;
  closed_at: ISODateTime | null;
  created_by: UUID | null;
  deleted_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface DealStageHistory {
  id: UUID;
  deal_id: UUID;
  workspace_id: UUID;
  from_stage_id: UUID | null;
  to_stage_id: UUID | null;
  changed_by: UUID | null;
  changed_at: ISODateTime;
}

export interface MoneyEntry {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID | null;
  kind: "income" | "expense";
  amount: number;
  currency: Currency;
  rate: number | null;
  /** computed by the database */
  amount_uzs: number;
  date: ISODate;
  method: "cash" | "card" | "transfer";
  partner_id: UUID | null;
  category: string | null;
  note: string | null;
  direct: boolean;
  status: "approved" | "pending" | "rejected";
  approved_by: UUID | null;
  approved_at: ISODateTime | null;
  created_by: UUID | null;
  deleted_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface NoteVersion {
  id: UUID;
  note_id: UUID;
  workspace_id: UUID;
  project_id: UUID;
  title: string;
  content: RichDoc;
  created_by: UUID | null;
  created_at: ISODateTime;
}

export interface NoteTask {
  note_id: UUID;
  task_id: UUID;
  workspace_id: UUID;
  created_at: ISODateTime;
}

/** Busy time read from the user's Google Calendar. */
export interface CalendarEvent {
  id: UUID;
  user_id: UUID;
  google_id: string;
  calendar_id: string;
  title: string | null;
  start_at: ISODateTime;
  end_at: ISODateTime;
  all_day: boolean;
  time_block_id: UUID | null;
  updated_at: ISODateTime;
}

export interface AuditEntry {
  id: UUID;
  workspace_id: UUID;
  actor_id: UUID | null;
  action: string;
  target_type: string | null;
  target_id: UUID | null;
  details: Record<string, unknown>;
  created_at: ISODateTime;
}
