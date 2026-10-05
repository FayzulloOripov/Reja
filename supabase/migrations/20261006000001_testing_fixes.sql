-- Fixes from the first round of user testing.

-- 1. Recurring tasks: link each generated occurrence to the one it came from, so a completion
--    creates exactly one next occurrence (also when two completions race) and reopening the
--    completed task can remove it again.
alter table public.tasks add column recurrence_parent_id uuid references public.tasks (id) on delete set null;
create unique index tasks_recurrence_parent_unique on public.tasks (recurrence_parent_id)
  where recurrence_parent_id is not null and deleted_at is null;

-- 2. Reminder timing. All-day tasks are reminded at 09:00 local time on the day; minute/hour offsets
--    only make sense for timed tasks, so for all-day tasks they collapse to 09:00, and "1 day before"
--    means 09:00 the day before. New users get "15 minutes before" by default.
create or replace function public.reminder_moment(p_due_date date, p_due_at timestamptz, p_tz text, p_rule text)
returns timestamptz
language sql stable set search_path = ''
as $$
  select case
    when p_due_at is not null then p_due_at - public.reminder_offset_interval(p_rule)
    when p_due_date is null then null
    when p_rule = '1d' then ((p_due_date - 1) + time '09:00') at time zone coalesce(p_tz, 'Asia/Tashkent')
    else (p_due_date + time '09:00') at time zone coalesce(p_tz, 'Asia/Tashkent')
  end
$$;

alter table public.profiles alter column default_reminder set default '15m';
update public.profiles set default_reminder = '15m' where default_reminder = 'at_due' and onboarded_at is null;

create or replace function public.sync_task_reminders(p_task uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.tasks;
  v_users uuid[];
  v_uid uuid;
  v_profile record;
  v_at timestamptz;
  r record;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    return;
  end if;

  if t.deleted_at is not null or t.status in ('done', 'cancelled') then
    update public.reminders set status = 'dismissed'
    where task_id = t.id and status in ('pending', 'snoozed');
    return;
  end if;

  -- offset-based (non-custom) reminders follow the due date
  for r in
    select rm.id, rm.offset_rule, rm.remind_at, p.timezone
    from public.reminders rm join public.profiles p on p.id = rm.user_id
    where rm.task_id = t.id and not rm.is_auto and rm.offset_rule <> 'custom'
      and rm.status in ('pending', 'snoozed', 'sent', 'dismissed')
  loop
    v_at := public.reminder_moment(t.due_date, t.due_at, r.timezone, r.offset_rule::text);
    if v_at is null then
      update public.reminders set status = 'dismissed' where id = r.id and status in ('pending', 'snoozed');
    elsif v_at <> r.remind_at then
      update public.reminders
      set remind_at = v_at,
          status = case when v_at > now() then 'pending'::public.reminder_status else status end,
          sent_at = case when v_at > now() then null else sent_at end
      where id = r.id;
    end if;
  end loop;

  -- automatic reminders: one per responsible user (assignees, or the creator when nobody is assigned)
  select coalesce(array_agg(a.user_id), '{}') into v_users from public.task_assignees a where a.task_id = t.id;
  if cardinality(v_users) = 0 and t.created_by is not null then
    v_users := array[t.created_by];
  end if;

  delete from public.reminders
  where task_id = t.id and is_auto and status in ('pending', 'snoozed') and not (user_id = any (v_users));

  foreach v_uid in array v_users loop
    select pr.timezone, pr.default_reminder into v_profile from public.profiles pr where pr.id = v_uid;
    if v_profile is null or v_profile.default_reminder = 'none' then
      delete from public.reminders where task_id = t.id and user_id = v_uid and is_auto and status in ('pending', 'snoozed');
      continue;
    end if;

    v_at := public.reminder_moment(t.due_date, t.due_at, v_profile.timezone, v_profile.default_reminder);

    if v_at is null then
      delete from public.reminders where task_id = t.id and user_id = v_uid and is_auto and status in ('pending', 'snoozed');
      continue;
    end if;

    insert into public.reminders (user_id, task_id, remind_at, offset_rule, is_auto, status)
    values (
      v_uid, t.id, v_at, v_profile.default_reminder::public.reminder_offset, true,
      case when v_at > now() then 'pending'::public.reminder_status else 'dismissed'::public.reminder_status end
    )
    on conflict (task_id, user_id) where is_auto do update
      set remind_at = excluded.remind_at,
          offset_rule = excluded.offset_rule,
          status = case
            when public.reminders.remind_at = excluded.remind_at then public.reminders.status
            when excluded.remind_at > now() then 'pending'::public.reminder_status
            else public.reminders.status
          end,
          sent_at = case
            when public.reminders.remind_at <> excluded.remind_at and excluded.remind_at > now() then null
            else public.reminders.sent_at
          end;
  end loop;
end;
$$;

-- 3. Projects: the owner can explain a manually set health.
alter table public.projects add column health_note text check (char_length(health_note) <= 500);

-- 4. Focus sessions are time entries with source 'focus'. A session may have no task (then it
--    belongs to the user's chosen workspace). Home and the focus page read the same rows, and only
--    finished sessions are stored as 'focus'.
alter table public.time_entries alter column task_id drop not null;
alter table public.time_entries add column source text not null default 'manual' check (source in ('manual', 'focus'));
create index on public.time_entries (user_id, source, started_at);

create or replace function public.fill_workspace_from_task()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ws uuid;
begin
  if new.task_id is null then
    if new.workspace_id is null then
      raise exception 'workspace_id is required without a task' using errcode = '23502';
    end if;
    return new;
  end if;
  select t.workspace_id into v_ws from public.tasks t where t.id = new.task_id;
  if v_ws is null then
    raise exception 'Task not found' using errcode = '23503';
  end if;
  new.workspace_id := v_ws;
  return new;
end;
$$;

drop policy time_entries_select on public.time_entries;
drop policy time_entries_insert on public.time_entries;
create policy time_entries_select on public.time_entries for select to authenticated
  using (user_id = (select auth.uid()) or (task_id is not null and public.can_read_task(task_id)));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and case when task_id is null then public.is_ws_member(workspace_id) else public.can_write_task(task_id) end
  );

-- 5. Goals have a start date, so the pace marker ("16% of the month passed") is exact.
alter table public.goals add column start_date date;
update public.goals set start_date = created_at::date where start_date is null;
