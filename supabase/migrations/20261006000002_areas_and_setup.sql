-- Areas above projects, the user's working day and capacity (round 2, phases 2–3).

-- ---------------------------------------------------------------- areas
-- An area groups projects (e.g. "Asosiy ish", "Agentlik", "Shaxsiy"). It belongs to a workspace and
-- is either shared with the workspace's full members or private to its owner.
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default 'sky',
  icon text,
  visibility text not null default 'workspace' check (visibility in ('workspace', 'private')),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  position double precision not null default 0,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.areas (workspace_id);
create trigger set_updated_at before update on public.areas for each row execute function public.set_updated_at();

alter table public.projects add column area_id uuid references public.areas (id) on delete set null;
create index on public.projects (area_id);

-- existing free-text areas become rows
insert into public.areas (workspace_id, name, owner_id)
select distinct on (p.workspace_id, trim(p.area)) p.workspace_id, trim(p.area), p.owner_id
from public.projects p
where p.area is not null and trim(p.area) <> '' and p.owner_id is not null
order by p.workspace_id, trim(p.area), p.created_at;
update public.projects p set area_id = a.id
from public.areas a
where a.workspace_id = p.workspace_id and a.name = trim(p.area) and p.area_id is null;

alter table public.areas enable row level security;
revoke all on public.areas from anon;
grant select, insert, update, delete on public.areas to authenticated;
grant all on public.areas to service_role;

-- shared areas: full members see them, and guests see the areas of projects shared with them
create policy areas_select on public.areas for select to authenticated
  using (
    (visibility = 'private' and owner_id = (select auth.uid()))
    or (
      visibility = 'workspace'
      and (
        public.is_ws_full_member(workspace_id)
        or exists (select 1 from public.projects p where p.area_id = areas.id and public.can_read_project(p.id))
      )
    )
  );
create policy areas_insert on public.areas for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and case when visibility = 'private' then public.is_ws_member(workspace_id) else public.is_ws_full_member(workspace_id) end
  );
create policy areas_update on public.areas for update to authenticated
  using (owner_id = (select auth.uid()) or (visibility = 'workspace' and public.is_ws_full_member(workspace_id)))
  with check (owner_id = (select auth.uid()) or (visibility = 'workspace' and public.is_ws_full_member(workspace_id)));
create policy areas_delete on public.areas for delete to authenticated
  using (owner_id = (select auth.uid()) or (visibility = 'workspace' and public.is_ws_admin(workspace_id)));

-- a project can only be put in an area of its own workspace
create function public.guard_project_area()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.area_id is not null and not exists (
    select 1 from public.areas a where a.id = new.area_id and a.workspace_id = new.workspace_id
  ) then
    raise exception 'Area belongs to another workspace' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_project_area before insert or update of area_id, workspace_id on public.projects
  for each row execute function public.guard_project_area();

-- ---------------------------------------------------------------- the user's day and capacity
alter table public.profiles
  add column work_start time not null default '10:00',
  add column work_end time not null default '19:00',
  add column day_start time not null default '07:00',
  add column day_end time not null default '22:00',
  add column daily_capacity_tasks smallint check (daily_capacity_tasks between 1 and 100),
  add column daily_capacity_minutes smallint check (daily_capacity_minutes between 15 and 1440);

grant update (work_start, work_end, day_start, day_end, daily_capacity_tasks, daily_capacity_minutes)
  on public.profiles to authenticated;
