-- Reja schema: types, tables, indexes.
-- Times are stored in UTC (timestamptz). Calendar days (due_date, top_date, habit dates)
-- are plain `date` values interpreted in the owner's timezone.

-- ---------------------------------------------------------------- types
create type public.workspace_role as enum ('owner', 'admin', 'member', 'guest');
create type public.project_role as enum ('manager', 'member', 'viewer');
create type public.project_status as enum ('active', 'paused', 'done', 'archived');
create type public.project_health as enum ('on_track', 'at_risk', 'off_track');
create type public.task_status as enum ('todo', 'in_progress', 'waiting', 'done', 'cancelled');
create type public.task_priority as enum ('urgent', 'high', 'medium', 'low', 'none');
create type public.reminder_offset as enum ('at_due', '15m', '1h', '1d', 'custom');
create type public.reminder_status as enum ('pending', 'sending', 'sent', 'snoozed', 'dismissed', 'failed');
create type public.notification_type as enum (
  'assigned', 'mentioned', 'due_soon', 'overdue', 'comment', 'status_change', 'invite', 'reminder'
);

-- ---------------------------------------------------------------- helpers
create function public.new_token(p_len int default 32)
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, p_len)
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null default '',
  avatar_url text,
  timezone text not null default 'Asia/Tashkent',
  language text not null default 'uz' check (language in ('uz', 'en')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  work_days smallint[] not null default '{1,2,3,4,5,6}',
  quiet_enabled boolean not null default true,
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  digest_enabled boolean not null default true,
  digest_time time not null default '07:30',
  review_enabled boolean not null default true,
  review_dow smallint not null default 7 check (review_dow between 1 and 7),
  review_time time not null default '09:00',
  overdue_nudge_enabled boolean not null default true,
  default_reminder text not null default 'at_due'
    check (default_reminder in ('none', 'at_due', '15m', '1h', '1d')),
  notify_prefs jsonb not null default '{
    "in_app":   {"assigned": true, "mentioned": true, "comment": true, "status_change": true, "invite": true, "reminder": true, "due_soon": true, "overdue": true},
    "telegram": {"assigned": true, "mentioned": true, "comment": false, "status_change": false, "invite": true, "reminder": true, "due_soon": true, "overdue": true, "digest": true, "review": true},
    "push":     {"assigned": true, "mentioned": true, "comment": true, "status_change": false, "invite": true, "reminder": true, "due_soon": true, "overdue": false},
    "email":    {"assigned": false, "mentioned": true, "comment": false, "status_change": false, "invite": true, "reminder": false, "due_soon": false, "overdue": false, "digest": false, "review": false}
  }'::jsonb,
  telegram_chat_id bigint unique,
  telegram_username text,
  ics_token text unique default public.new_token(40),
  onboarded_at timestamptz,
  current_workspace_id uuid,
  pomodoro_work smallint not null default 25 check (pomodoro_work between 5 and 120),
  pomodoro_break smallint not null default 5 check (pomodoro_break between 1 and 60),
  last_digest_on date,
  last_review_on date,
  last_overdue_nudge_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  user_agent text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);

create table public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.telegram_link_codes (user_id);

-- ---------------------------------------------------------------- workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  icon text,
  color text not null default 'tangerine',
  owner_id uuid not null references public.profiles (id),
  is_personal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.profiles
  add constraint profiles_current_workspace_fk
  foreign key (current_workspace_id) references public.workspaces (id) on delete set null;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

-- ---------------------------------------------------------------- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description jsonb,
  color text not null default 'sky',
  icon text,
  area text,
  status public.project_status not null default 'active',
  visibility text not null default 'workspace' check (visibility in ('workspace', 'private')),
  start_date date,
  target_date date,
  goal text,
  health public.project_health,
  health_manual boolean not null default false,
  owner_id uuid references public.profiles (id) on delete set null,
  position double precision not null default 0,
  share_token text unique,
  telegram_chat_id bigint,
  telegram_link_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.projects (workspace_id) where deleted_at is null;

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role public.project_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index on public.project_members (user_id);
create index on public.project_members (workspace_id);

create table public.project_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  email text,
  role text not null check (role in ('admin', 'member', 'guest', 'manager', 'viewer')),
  token text not null unique default public.new_token(40),
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  -- project invitations use project roles; workspace invitations use workspace roles
  check (
    (project_id is null and role in ('admin', 'member', 'guest'))
    or (project_id is not null and role in ('manager', 'member', 'viewer'))
  )
);
create index on public.invitations (workspace_id);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.sections (project_id);

-- ---------------------------------------------------------------- tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  section_id uuid references public.sections (id) on delete set null,
  parent_id uuid references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  description jsonb,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'none',
  start_date date,
  due_date date,
  due_at timestamptz,
  deadline date,
  estimate_min integer check (estimate_min is null or estimate_min between 1 and 10000),
  recurrence text,
  top_date date,
  position double precision not null default 0,
  completed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (start_date is null or due_date is null or start_date <= due_date)
);
create index on public.tasks (workspace_id) where deleted_at is null;
create index on public.tasks (project_id) where deleted_at is null;
create index on public.tasks (created_by) where project_id is null;
create index on public.tasks (parent_id);
create index on public.tasks (due_date) where deleted_at is null and status not in ('done', 'cancelled');

create table public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index on public.task_assignees (user_id);
create index on public.task_assignees (workspace_id);

create table public.task_watchers (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index on public.task_watchers (workspace_id);

create table public.task_dependencies (
  blocker_id uuid not null references public.tasks (id) on delete cascade,
  blocked_id uuid not null references public.tasks (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index on public.task_dependencies (workspace_id);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default 'sky',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.labels (workspace_id);

create table public.task_labels (
  task_id uuid not null references public.tasks (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, label_id)
);
create index on public.task_labels (workspace_id);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.checklist_items (task_id);
create index on public.checklist_items (workspace_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body jsonb not null,
  body_text text not null default '',
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.comments (task_id);
create index on public.comments (workspace_id);

create table public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
create index on public.comment_reactions (workspace_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  storage_path text not null unique,
  name text not null,
  size bigint not null check (size >= 0),
  mime text not null default 'application/octet-stream',
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.attachments (task_id);
create index on public.attachments (workspace_id);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  minutes integer not null check (minutes between 1 and 1440),
  note text,
  created_at timestamptz not null default now()
);
create index on public.time_entries (task_id);
create index on public.time_entries (user_id, started_at);
create index on public.time_entries (workspace_id);

-- ---------------------------------------------------------------- reminders & notifications
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  title text,
  remind_at timestamptz not null,
  offset_rule public.reminder_offset not null default 'custom',
  is_auto boolean not null default false,
  channels text[] not null default '{in_app,telegram,push}',
  status public.reminder_status not null default 'pending',
  attempts smallint not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (task_id is not null or title is not null)
);
create index reminders_due_idx on public.reminders (remind_at) where status in ('pending', 'snoozed');
create index on public.reminders (task_id);
create index on public.reminders (user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  type public.notification_type not null,
  actor_id uuid references public.profiles (id) on delete set null,
  task_id uuid references public.tasks (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  title text not null,
  body text,
  url text,
  data jsonb not null default '{}',
  read_at timestamptz,
  delivery text not null default 'pending' check (delivery in ('pending', 'sending', 'done', 'skipped')),
  deliver_after timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index notifications_delivery_idx on public.notifications (deliver_after) where delivery = 'pending';

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  diff jsonb not null default '{}',
  group_posted boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.activity_log (workspace_id, created_at desc);
create index on public.activity_log (task_id, created_at desc);
create index on public.activity_log (project_id, created_at desc);

-- ---------------------------------------------------------------- goals, notes
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  owner_id uuid default auth.uid() references public.profiles (id) on delete set null,
  target_date date,
  status text not null default 'active' check (status in ('active', 'achieved', 'missed', 'archived')),
  color text not null default 'violet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.goals (workspace_id);

create table public.key_results (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  start_value numeric not null default 0,
  target numeric not null,
  current numeric not null default 0,
  unit text,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.key_results (goal_id);
create index on public.key_results (workspace_id);

create table public.key_result_history (
  id uuid primary key default gen_random_uuid(),
  key_result_id uuid not null references public.key_results (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  value numeric not null,
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index on public.key_result_history (key_result_id, recorded_at);
create index on public.key_result_history (workspace_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null default '',
  content jsonb,
  position double precision not null default 0,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.notes (project_id);
create index on public.notes (workspace_id);

-- ---------------------------------------------------------------- personal: habits, time blocks
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  icon text,
  color text not null default 'emerald',
  days smallint[] not null default '{1,2,3,4,5,6,7}',
  position double precision not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.habits (user_id);

create table public.habit_logs (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, date)
);
create index on public.habit_logs (user_id, date);

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  task_id uuid references public.tasks (id) on delete set null,
  title text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index on public.time_blocks (user_id, date);

-- ---------------------------------------------------------------- views, templates, misc
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade, -- null = shared with workspace
  project_id uuid references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  view_type text not null default 'list',
  filters jsonb not null default '{}',
  sort jsonb not null default '{}',
  grouping text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.saved_views (workspace_id);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('project', 'task')),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  data jsonb not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.templates (workspace_id);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

-- ---------------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'workspaces', 'projects', 'sections', 'tasks', 'labels', 'checklist_items',
    'comments', 'reminders', 'goals', 'key_results', 'notes', 'habits', 'time_blocks',
    'saved_views', 'templates'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t
    );
  end loop;
end $$;
