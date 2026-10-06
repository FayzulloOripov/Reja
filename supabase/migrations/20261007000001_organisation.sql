-- Round 2, phase 5: waiting-for, outside contacts, meetings, weekly review, daily shutdown, routines.

-- ---------------------------------------------------------------- contacts
-- People without an account (a client's CTO, a supplier). Shared with the workspace's full members.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text check (char_length(phone) <= 40),
  telegram text check (char_length(telegram) <= 64),
  company text check (char_length(company) <= 120),
  note text check (char_length(note) <= 2000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.contacts (workspace_id);
create trigger set_updated_at before update on public.contacts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- waiting-for on tasks
alter table public.tasks
  add column waiting_on_user_id uuid references public.profiles (id) on delete set null,
  add column waiting_on_contact_id uuid references public.contacts (id) on delete set null,
  add column waiting_since date,
  add column follow_up_date date;
create index on public.tasks (waiting_on_user_id) where waiting_on_user_id is not null;
create index on public.tasks (waiting_on_contact_id) where waiting_on_contact_id is not null;

-- ---------------------------------------------------------------- meetings
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  duration_min smallint not null default 60 check (duration_min between 5 and 720),
  location text check (char_length(location) <= 200),
  notes jsonb,
  recurrence text,
  template_key text,
  series_id uuid,
  finished_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.meetings (workspace_id, starts_at);
create trigger set_updated_at before update on public.meetings for each row execute function public.set_updated_at();

create table public.meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (contact_id is null))
);
create unique index meeting_attendees_user on public.meeting_attendees (meeting_id, user_id) where user_id is not null;
create unique index meeting_attendees_contact on public.meeting_attendees (meeting_id, contact_id) where contact_id is not null;

create table public.meeting_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('agenda', 'decision')),
  text text not null check (char_length(text) between 1 and 1000),
  task_id uuid references public.tasks (id) on delete set null,
  done boolean not null default false,
  position double precision not null default 0,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.meeting_items (meeting_id);
create trigger set_updated_at before update on public.meeting_items for each row execute function public.set_updated_at();

-- workspace_id of attendees and items always follows their meeting
create function public.fill_workspace_from_meeting()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid;
begin
  select m.workspace_id into v_ws from public.meetings m where m.id = new.meeting_id;
  if v_ws is null then
    raise exception 'Meeting not found' using errcode = '23503';
  end if;
  new.workspace_id := v_ws;
  return new;
end;
$$;
create trigger fill_workspace before insert or update of meeting_id on public.meeting_attendees for each row execute function public.fill_workspace_from_meeting();
create trigger fill_workspace before insert or update of meeting_id on public.meeting_items for each row execute function public.fill_workspace_from_meeting();

-- ---------------------------------------------------------------- weekly review & daily shutdown (private)
create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_start date not null,
  data jsonb not null default '{}',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create trigger set_updated_at before update on public.weekly_reviews for each row execute function public.set_updated_at();

create table public.daily_shutdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  data jsonb not null default '{}',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create trigger set_updated_at before update on public.daily_shutdowns for each row execute function public.set_updated_at();

alter table public.profiles
  add column shutdown_enabled boolean not null default false,
  add column shutdown_time time not null default '18:30',
  add column last_shutdown_on date;
grant update (shutdown_enabled, shutdown_time) on public.profiles to authenticated;

-- the scheduler's once-a-day slots get a "shutdown" kind
create or replace function public.claim_daily_slot(p_user uuid, p_kind text, p_date date)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_kind = 'digest' then
    update public.profiles set last_digest_on = p_date
    where id = p_user and (last_digest_on is null or last_digest_on < p_date) returning id into v_id;
  elsif p_kind = 'review' then
    update public.profiles set last_review_on = p_date
    where id = p_user and (last_review_on is null or last_review_on < p_date) returning id into v_id;
  elsif p_kind = 'overdue' then
    update public.profiles set last_overdue_nudge_on = p_date
    where id = p_user and (last_overdue_nudge_on is null or last_overdue_nudge_on < p_date) returning id into v_id;
  elsif p_kind = 'shutdown' then
    update public.profiles set last_shutdown_on = p_date
    where id = p_user and (last_shutdown_on is null or last_shutdown_on < p_date) returning id into v_id;
  else
    raise exception 'unknown slot %', p_kind;
  end if;
  return v_id is not null;
end;
$$;

-- ---------------------------------------------------------------- routines
-- Reusable checklists that recur (morning routine, monthly payroll close). Each day's run is a row.
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  recurrence text not null default 'FREQ=DAILY',
  visibility text not null default 'private' check (visibility in ('private', 'workspace')),
  color text not null default 'teal',
  position double precision not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.routines (workspace_id);
create trigger set_updated_at before update on public.routines for each row execute function public.set_updated_at();

create table public.routine_runs (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  checked jsonb not null default '[]' check (jsonb_typeof(checked) = 'array'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routine_id, date)
);
create trigger set_updated_at before update on public.routine_runs for each row execute function public.set_updated_at();

create function public.fill_workspace_from_routine()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid;
begin
  select r.workspace_id into v_ws from public.routines r where r.id = new.routine_id;
  if v_ws is null then
    raise exception 'Routine not found' using errcode = '23503';
  end if;
  new.workspace_id := v_ws;
  return new;
end;
$$;
create trigger fill_workspace before insert or update of routine_id on public.routine_runs for each row execute function public.fill_workspace_from_routine();

create function public.can_read_routine(p_routine uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.routines r
    where r.id = p_routine
      and (r.owner_id = p_uid or (r.visibility = 'workspace' and public.is_ws_full_member(r.workspace_id, p_uid)))
  )
$$;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['contacts', 'meetings', 'meeting_attendees', 'meeting_items', 'weekly_reviews', 'daily_shutdowns', 'routines', 'routine_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- contacts: the workspace's full members (guests never see the address book)
create policy contacts_all on public.contacts for all to authenticated
  using (public.is_ws_full_member(workspace_id))
  with check (public.is_ws_full_member(workspace_id));

-- meetings: full members of the workspace; a meeting tied to a project is also visible to anyone who
-- can read that project, and writable by anyone who can write it
create function public.can_read_meeting(p_meeting uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting
      and (public.is_ws_full_member(m.workspace_id, p_uid) or (m.project_id is not null and public.can_read_project(m.project_id, p_uid)))
  )
$$;
create function public.can_write_meeting(p_meeting uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting
      and (public.is_ws_full_member(m.workspace_id, p_uid) or (m.project_id is not null and public.can_write_project(m.project_id, p_uid)))
  )
$$;

create policy meetings_select on public.meetings for select to authenticated
  using (public.is_ws_full_member(workspace_id) or (project_id is not null and public.can_read_project(project_id)));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.is_ws_full_member(workspace_id) or (project_id is not null and public.can_write_project(project_id)));
create policy meetings_update on public.meetings for update to authenticated
  using (public.is_ws_full_member(workspace_id) or (project_id is not null and public.can_write_project(project_id)))
  with check (public.is_ws_full_member(workspace_id) or (project_id is not null and public.can_write_project(project_id)));
create policy meetings_delete on public.meetings for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_ws_admin(workspace_id));

create policy meeting_attendees_select on public.meeting_attendees for select to authenticated using (public.can_read_meeting(meeting_id));
create policy meeting_attendees_write on public.meeting_attendees for insert to authenticated with check (public.can_write_meeting(meeting_id));
create policy meeting_attendees_delete on public.meeting_attendees for delete to authenticated using (public.can_write_meeting(meeting_id));

create policy meeting_items_select on public.meeting_items for select to authenticated using (public.can_read_meeting(meeting_id));
create policy meeting_items_insert on public.meeting_items for insert to authenticated with check (public.can_write_meeting(meeting_id));
create policy meeting_items_update on public.meeting_items for update to authenticated using (public.can_write_meeting(meeting_id)) with check (public.can_write_meeting(meeting_id));
create policy meeting_items_delete on public.meeting_items for delete to authenticated using (public.can_write_meeting(meeting_id));

-- personal
create policy weekly_reviews_owner on public.weekly_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy daily_shutdowns_owner on public.daily_shutdowns for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- routines: owner always; shared routines are visible to the workspace's full members
create policy routines_select on public.routines for select to authenticated
  using (owner_id = (select auth.uid()) or (visibility = 'workspace' and public.is_ws_full_member(workspace_id)));
create policy routines_insert on public.routines for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_ws_member(workspace_id));
create policy routines_update on public.routines for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy routines_delete on public.routines for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy routine_runs_select on public.routine_runs for select to authenticated
  using (user_id = (select auth.uid()) or public.can_read_routine(routine_id));
create policy routine_runs_write on public.routine_runs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_read_routine(routine_id));
create policy routine_runs_update on public.routine_runs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy routine_runs_delete on public.routine_runs for delete to authenticated
  using (user_id = (select auth.uid()));

-- a waiting-for contact must belong to the task's workspace
create function public.guard_task_waiting()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.waiting_on_contact_id is not null and not exists (
    select 1 from public.contacts c where c.id = new.waiting_on_contact_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'Contact belongs to another workspace' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_task_waiting before insert or update of waiting_on_contact_id, workspace_id on public.tasks
  for each row execute function public.guard_task_waiting();
