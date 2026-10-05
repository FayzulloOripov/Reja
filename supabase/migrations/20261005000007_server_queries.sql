-- Read helpers for server code that runs as the service role (scheduler, Telegram bot, ICS feed).
-- Each one re-checks access with the same helpers the RLS policies use, for an explicit user.

-- Open top-level tasks a user is responsible for: assigned to them, or created by them with no
-- assignee. Limited to tasks dated up to p_until or marked as a top-3 task.
create function public.responsible_open_tasks(p_user uuid, p_until date)
returns setof public.tasks
language sql stable security definer set search_path = ''
as $$
  select t.* from public.tasks t
  where t.deleted_at is null
    and t.status in ('todo', 'in_progress', 'waiting')
    and t.parent_id is null
    and (
      exists (select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = p_user)
      or (t.created_by = p_user and not exists (select 1 from public.task_assignees a where a.task_id = t.id))
    )
    and ((t.due_date is not null and t.due_date <= p_until) or t.top_date is not null)
    and public.can_read_task(t.id, p_user)
  order by t.due_date nulls last, t.due_at nulls last, t.position
$$;

-- Tasks a user completed in a window (weekly review).
create function public.completed_count(p_user uuid, p_from timestamptz, p_to timestamptz)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.tasks t
  where t.deleted_at is null and t.status = 'done' and t.completed_at >= p_from and t.completed_at < p_to
    and (
      exists (select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = p_user)
      or (t.created_by = p_user and not exists (select 1 from public.task_assignees a where a.task_id = t.id))
    )
$$;

-- Projects a user can add tasks to (for the bot's #project parsing).
create function public.writable_projects(p_user uuid)
returns table (id uuid, name text, workspace_id uuid)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.workspace_id from public.projects p
  where p.deleted_at is null and p.status <> 'archived' and public.can_write_project(p.id, p_user)
  order by p.name
$$;

-- Calendar feed items for the owner of an ICS token: dated tasks they are responsible for and
-- their time blocks, from 30 days ago to a year ahead.
create function public.ics_items(p_token text)
returns table (
  kind text,
  id uuid,
  title text,
  due_date date,
  due_at timestamptz,
  estimate_min integer,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  project_name text,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid;
begin
  if p_token is null or length(p_token) < 32 then
    return;
  end if;
  select pr.id into v_user from public.profiles pr where pr.ics_token = p_token;
  if v_user is null then
    return;
  end if;

  return query
    select 'task'::text, t.id, t.title, t.due_date, t.due_at, t.estimate_min, null::timestamptz, null::timestamptz,
           t.status::text, p.name, t.updated_at
    from public.tasks t
    left join public.projects p on p.id = t.project_id
    where t.deleted_at is null
      and t.due_date between current_date - 30 and current_date + 365
      and t.status <> 'cancelled'
      and (
        exists (select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = v_user)
        or (t.created_by = v_user and not exists (select 1 from public.task_assignees a where a.task_id = t.id))
      )
      and public.can_read_task(t.id, v_user)
    union all
    select 'block'::text, b.id, coalesce(b.title, t2.title, ''), b.date, null::timestamptz, null::integer, b.start_at, b.end_at,
           'block'::text, null::text, b.updated_at
    from public.time_blocks b
    left join public.tasks t2 on t2.id = b.task_id
    where b.user_id = v_user and b.date between current_date - 30 and current_date + 365;
end;
$$;

revoke execute on function
  public.responsible_open_tasks(uuid, date),
  public.completed_count(uuid, timestamptz, timestamptz),
  public.writable_projects(uuid),
  public.ics_items(text)
from public, anon, authenticated;

grant execute on function
  public.responsible_open_tasks(uuid, date),
  public.completed_count(uuid, timestamptz, timestamptz),
  public.writable_projects(uuid),
  public.ics_items(text)
to service_role;
