-- Round 2, phase 7: energy labels, prayer-aware planning, two-way Google Calendar.

-- ---------------------------------------------------------------- energy labels
alter table public.tasks
  add column energy text check (energy in ('deep', 'quick'));

-- ---------------------------------------------------------------- prayer-aware planning (off by default)
alter table public.profiles
  add column prayer_enabled boolean not null default false,
  add column prayer_city text check (char_length(prayer_city) <= 60),
  add column prayer_lat numeric(8, 5) check (prayer_lat between -90 and 90),
  add column prayer_lng numeric(8, 5) check (prayer_lng between -180 and 180),
  add column prayer_madhab text not null default 'hanafi' check (prayer_madhab in ('hanafi', 'shafi')),
  -- minutes kept free after each prayer starts
  add column prayer_minutes smallint not null default 20 check (prayer_minutes between 5 and 60);
grant update (prayer_enabled, prayer_city, prayer_lat, prayer_lng, prayer_madhab, prayer_minutes) on public.profiles to authenticated;

-- ---------------------------------------------------------------- Google Calendar
-- Tokens are server-only: no client role can read or write them.
create table public.google_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text,
  calendar_id text not null default 'primary',
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.google_connections for each row execute function public.set_updated_at();
alter table public.google_connections enable row level security;
revoke all on public.google_connections from anon, authenticated;
grant all on public.google_connections to service_role;

-- What the client may know about the connection (no tokens)
create function public.google_status()
returns table (connected boolean, email text, last_synced_at timestamptz, last_error text)
language sql stable security definer set search_path = ''
as $$
  select true, g.email, g.last_synced_at, g.last_error from public.google_connections g where g.user_id = auth.uid()
$$;
grant execute on function public.google_status() to authenticated;

-- Busy time read from Google, per user (recurring events arrive expanded, one row per occurrence)
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  google_id text not null,
  calendar_id text not null default 'primary',
  title text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  -- set when the event mirrors one of our time blocks (so it is not shown twice)
  time_block_id uuid,
  updated_at timestamptz not null default now(),
  unique (user_id, google_id)
);
create index on public.calendar_events (user_id, start_at);
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon;
grant select on public.calendar_events to authenticated;
grant all on public.calendar_events to service_role;
create policy calendar_events_owner on public.calendar_events for select to authenticated using (user_id = (select auth.uid()));

-- A time block can be mirrored to Google Calendar (optional per block)
alter table public.time_blocks
  add column sync_google boolean not null default false,
  add column google_event_id text;
