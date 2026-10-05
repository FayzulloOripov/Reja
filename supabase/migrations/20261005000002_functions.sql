-- Reja functions and triggers.
-- Access helpers are SECURITY DEFINER with an empty search_path so RLS policies can call them
-- without recursion, and take an explicit user id so service-role code can reuse the same rules.

-- ================================================================ access helpers

create function public.ws_role(p_ws uuid, p_uid uuid default auth.uid())
returns public.workspace_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.workspace_members m
  where m.workspace_id = p_ws and m.user_id = p_uid
$$;

create function public.is_ws_member(p_ws uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m where m.workspace_id = p_ws and m.user_id = p_uid
  )
$$;

-- owner, admin and member see every non-private project; guests only see projects shared with them
create function public.is_ws_full_member(p_ws uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_ws and m.user_id = p_uid and m.role in ('owner', 'admin', 'member')
  )
$$;

create function public.is_ws_admin(p_ws uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_ws and m.user_id = p_uid and m.role in ('owner', 'admin')
  )
$$;

-- 'manage' | 'write' | 'read' | null
create function public.project_access(p_project uuid, p_uid uuid default auth.uid())
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ws uuid;
  v_vis text;
  v_owner uuid;
  v_ws_role public.workspace_role;
  v_pm_role public.project_role;
begin
  if p_project is null or p_uid is null then
    return null;
  end if;

  select p.workspace_id, p.visibility, p.owner_id into v_ws, v_vis, v_owner
  from public.projects p where p.id = p_project;
  if v_ws is null then
    return null;
  end if;

  select m.role into v_ws_role from public.workspace_members m
  where m.workspace_id = v_ws and m.user_id = p_uid;
  if v_ws_role is null then
    return null; -- not in the workspace at all
  end if;

  select pm.role into v_pm_role from public.project_members pm
  where pm.project_id = p_project and pm.user_id = p_uid;

  if v_owner = p_uid then
    return 'manage';
  end if;

  if v_pm_role = 'manager' then
    return 'manage';
  end if;

  if v_vis = 'workspace' and v_ws_role in ('owner', 'admin') then
    return 'manage';
  end if;

  if v_pm_role = 'member' then
    return 'write';
  end if;

  if v_vis = 'workspace' and v_ws_role = 'member' then
    return 'write';
  end if;

  if v_pm_role = 'viewer' then
    return 'read';
  end if;

  return null;
end;
$$;

create function public.can_read_project(p_project uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.project_access(p_project, p_uid) is not null $$;

create function public.can_write_project(p_project uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.project_access(p_project, p_uid) in ('write', 'manage'), false) $$;

create function public.can_manage_project(p_project uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.project_access(p_project, p_uid) = 'manage', false) $$;

create function public.can_read_task(p_task uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when t.project_id is null then t.created_by = p_uid
      else public.can_read_project(t.project_id, p_uid)
    end
    from public.tasks t where t.id = p_task
  ), false)
$$;

create function public.can_write_task(p_task uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when t.project_id is null then t.created_by = p_uid
      else public.can_write_project(t.project_id, p_uid)
    end
    from public.tasks t where t.id = p_task
  ), false)
$$;

create function public.can_read_goal(p_goal uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when g.project_id is null then public.is_ws_full_member(g.workspace_id, p_uid)
      else public.can_read_project(g.project_id, p_uid)
    end
    from public.goals g where g.id = p_goal
  ), false)
$$;

create function public.can_write_goal(p_goal uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when g.project_id is null then public.is_ws_full_member(g.workspace_id, p_uid)
      else public.can_write_project(g.project_id, p_uid)
    end
    from public.goals g where g.id = p_goal
  ), false)
$$;

-- true when the two users share a workspace (full membership) or a project
create function public.shares_space_with(p_other uuid, p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_other = p_uid
    or exists (
      select 1 from public.workspace_members a
      join public.workspace_members b on b.workspace_id = a.workspace_id
      where a.user_id = p_uid and b.user_id = p_other
        and (a.role in ('owner', 'admin', 'member') or b.role in ('owner', 'admin', 'member'))
    )
    or exists (
      select 1 from public.project_members a
      join public.project_members b on b.project_id = a.project_id
      where a.user_id = p_uid and b.user_id = p_other
    )
$$;

-- ================================================================ sign-up bootstrap

create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ws uuid;
  v_lang text := coalesce(new.raw_user_meta_data ->> 'language', 'uz');
begin
  if v_lang not in ('uz', 'en') then
    v_lang := 'uz';
  end if;

  insert into public.profiles (id, email, name, avatar_url, language)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    v_lang
  );

  insert into public.workspaces (name, owner_id, is_personal, icon, color)
  values (case when v_lang = 'en' then 'Personal' else 'Shaxsiy' end, new.id, true, 'sparkles', 'tangerine')
  returning id into v_ws;

  update public.profiles set current_workspace_id = v_ws where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

create function public.handle_new_workspace()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- ================================================================ integrity triggers

create function public.guard_workspace_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- the owner row can only change through ownership transfer (service role)
  if auth.uid() is not null then
    if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner'
       and exists (select 1 from public.workspaces w where w.id = old.workspace_id and w.owner_id = old.user_id) then
      raise exception 'The workspace owner cannot be changed or removed' using errcode = '42501';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.role = 'owner'
       and not exists (select 1 from public.workspaces w where w.id = new.workspace_id and w.owner_id = new.user_id) then
      raise exception 'Cannot grant the owner role' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    -- leaving a workspace removes project-level access in it too
    delete from public.project_members where workspace_id = old.workspace_id and user_id = old.user_id;
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_workspace_member
  before insert or update or delete on public.workspace_members
  for each row execute function public.guard_workspace_member();

create function public.guard_project()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.owner_id := coalesce(new.owner_id, auth.uid());
    end if;
    return new;
  end if;

  if new.workspace_id <> old.workspace_id then
    raise exception 'Projects cannot move between workspaces' using errcode = '42501';
  end if;

  if auth.uid() is not null and not public.can_manage_project(old.id) then
    if new.deleted_at is distinct from old.deleted_at
      or new.share_token is distinct from old.share_token
      or new.visibility is distinct from old.visibility
      or new.owner_id is distinct from old.owner_id
      or new.telegram_chat_id is distinct from old.telegram_chat_id then
      raise exception 'Only project managers can change this setting' using errcode = '42501';
    end if;
  end if;

  -- connecting a Telegram group goes through the bot (service role) only
  if auth.uid() is not null and new.telegram_chat_id is distinct from old.telegram_chat_id
     and new.telegram_chat_id is not null then
    raise exception 'Connect a Telegram group from the bot' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_project
  before insert or update on public.projects
  for each row execute function public.guard_project();

create function public.fill_workspace_from_project()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select p.workspace_id into new.workspace_id from public.projects p where p.id = new.project_id;
  if new.workspace_id is null then
    raise exception 'Project not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger fill_workspace before insert or update of project_id on public.sections
  for each row execute function public.fill_workspace_from_project();
create trigger fill_workspace before insert or update of project_id on public.project_members
  for each row execute function public.fill_workspace_from_project();
create trigger fill_workspace before insert or update of project_id on public.notes
  for each row execute function public.fill_workspace_from_project();

create function public.fill_workspace_from_task()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select t.workspace_id into new.workspace_id from public.tasks t where t.id = new.task_id;
  if new.workspace_id is null then
    raise exception 'Task not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'task_assignees', 'task_watchers', 'task_labels', 'checklist_items', 'comments',
    'attachments', 'time_entries'
  ] loop
    execute format(
      'create trigger fill_workspace before insert or update of task_id on public.%I
         for each row execute function public.fill_workspace_from_task()', t
    );
  end loop;
end $$;

create function public.fill_workspace_for_dependency()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_other uuid;
begin
  select t.workspace_id into new.workspace_id from public.tasks t where t.id = new.blocked_id;
  select t.workspace_id into v_other from public.tasks t where t.id = new.blocker_id;
  if new.workspace_id is null or v_other is distinct from new.workspace_id then
    raise exception 'Dependencies must be in the same workspace' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger fill_workspace before insert or update on public.task_dependencies
  for each row execute function public.fill_workspace_for_dependency();

create function public.fill_workspace_for_reaction()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select c.workspace_id into new.workspace_id from public.comments c where c.id = new.comment_id;
  return new;
end;
$$;

create trigger fill_workspace before insert on public.comment_reactions
  for each row execute function public.fill_workspace_for_reaction();

create function public.fill_workspace_for_key_result()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'key_results' then
    select g.workspace_id into new.workspace_id from public.goals g where g.id = new.goal_id;
  else
    select k.workspace_id into new.workspace_id from public.key_results k where k.id = new.key_result_id;
  end if;
  return new;
end;
$$;

create trigger fill_workspace before insert on public.key_results
  for each row execute function public.fill_workspace_for_key_result();
create trigger fill_workspace before insert on public.key_result_history
  for each row execute function public.fill_workspace_for_key_result();

create function public.fill_workspace_for_reminder()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.task_id is not null then
    select t.workspace_id into new.workspace_id from public.tasks t where t.id = new.task_id;
  end if;
  return new;
end;
$$;

create trigger fill_workspace before insert or update of task_id on public.reminders
  for each row execute function public.fill_workspace_for_reminder();

create function public.guard_task()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_parent record;
  v_ws uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  else
    new.created_by := old.created_by;
  end if;

  -- subtasks always live with their parent
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A task cannot be its own parent' using errcode = '23514';
    end if;
    select t.project_id, t.workspace_id into v_parent from public.tasks t where t.id = new.parent_id;
    new.project_id := v_parent.project_id;
    new.workspace_id := v_parent.workspace_id;
  end if;

  if new.project_id is not null then
    select p.workspace_id into v_ws from public.projects p where p.id = new.project_id;
    new.workspace_id := v_ws;
  end if;

  if new.section_id is not null and not exists (
    select 1 from public.sections s where s.id = new.section_id and s.project_id = new.project_id
  ) then
    new.section_id := null;
  end if;

  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create trigger guard_task before insert or update on public.tasks
  for each row execute function public.guard_task();

create function public.cascade_task_move()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.tasks
  set project_id = new.project_id, section_id = null
  where parent_id = new.id and project_id is distinct from new.project_id;
  return new;
end;
$$;

create trigger cascade_task_move after update of project_id on public.tasks
  for each row when (old.project_id is distinct from new.project_id)
  execute function public.cascade_task_move();

create function public.guard_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.author_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.author_id := old.author_id;
    new.task_id := old.task_id;
  end if;
  return new;
end;
$$;

create trigger guard_comment before insert or update on public.comments
  for each row execute function public.guard_comment();

-- ================================================================ reminders

create function public.reminder_offset_interval(p_rule text)
returns interval
language sql immutable set search_path = ''
as $$
  select case p_rule
    when '15m' then interval '15 minutes'
    when '1h' then interval '1 hour'
    when '1d' then interval '1 day'
    else interval '0'
  end
$$;

-- Moment a task is "due" for a user: the exact due_at when a time is set, otherwise 09:00 local time.
create function public.task_due_moment(p_due_date date, p_due_at timestamptz, p_tz text)
returns timestamptz
language sql stable set search_path = ''
as $$
  select coalesce(
    p_due_at,
    case when p_due_date is null then null
         else (p_due_date + time '09:00') at time zone coalesce(p_tz, 'Asia/Tashkent') end
  )
$$;

create unique index reminders_auto_unique on public.reminders (task_id, user_id) where is_auto;

create function public.sync_task_reminders(p_task uuid)
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
    v_at := public.task_due_moment(t.due_date, t.due_at, r.timezone)
            - public.reminder_offset_interval(r.offset_rule::text);
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

    v_at := public.task_due_moment(t.due_date, t.due_at, v_profile.timezone)
            - public.reminder_offset_interval(v_profile.default_reminder);

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

create function public.on_task_reminder_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.sync_task_reminders(new.id);
  return null;
end;
$$;

create trigger sync_reminders_insert after insert on public.tasks
  for each row execute function public.on_task_reminder_fields();

create trigger sync_reminders_update after update of due_date, due_at, status, deleted_at on public.tasks
  for each row when (
    old.due_date is distinct from new.due_date
    or old.due_at is distinct from new.due_at
    or old.status is distinct from new.status
    or old.deleted_at is distinct from new.deleted_at
  )
  execute function public.on_task_reminder_fields();

create function public.on_assignee_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.sync_task_reminders(coalesce(new.task_id, old.task_id));
  return null;
end;
$$;

create trigger sync_reminders_assignees after insert or delete on public.task_assignees
  for each row execute function public.on_assignee_change();

-- default reminder rule change re-syncs that user's open tasks
create function public.on_default_reminder_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_task uuid;
begin
  for v_task in
    select distinct t.id from public.tasks t
    left join public.task_assignees a on a.task_id = t.id
    where (a.user_id = new.id or (t.created_by = new.id))
      and t.deleted_at is null and t.status not in ('done', 'cancelled')
      and (t.due_date is not null or t.due_at is not null)
  loop
    perform public.sync_task_reminders(v_task);
  end loop;
  return null;
end;
$$;

create trigger sync_reminders_profile after update of default_reminder, timezone on public.profiles
  for each row when (old.default_reminder is distinct from new.default_reminder or old.timezone is distinct from new.timezone)
  execute function public.on_default_reminder_change();

-- ================================================================ activity log

create function public.log_activity(
  p_ws uuid, p_project uuid, p_task uuid, p_entity text, p_entity_id uuid, p_action text, p_diff jsonb
)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.activity_log (workspace_id, project_id, task_id, actor_id, entity_type, entity_id, action, diff)
  values (p_ws, p_project, p_task, auth.uid(), p_entity, p_entity_id, p_action, coalesce(p_diff, '{}'))
$$;

create function public.on_task_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_diff jsonb := '{}';
  v_col text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.workspace_id, new.project_id, new.id, 'task', new.id, 'created',
      jsonb_build_object('title', new.title));
    return null;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    perform public.log_activity(new.workspace_id, new.project_id, new.id, 'task', new.id, 'deleted',
      jsonb_build_object('title', new.title));
    return null;
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    perform public.log_activity(new.workspace_id, new.project_id, new.id, 'task', new.id, 'restored',
      jsonb_build_object('title', new.title));
    return null;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach v_col in array array[
    'title', 'status', 'priority', 'start_date', 'due_date', 'due_at', 'deadline', 'project_id',
    'section_id', 'parent_id', 'top_date', 'estimate_min', 'recurrence'
  ] loop
    if v_old -> v_col is distinct from v_new -> v_col then
      v_diff := v_diff || jsonb_build_object(v_col, jsonb_build_array(v_old -> v_col, v_new -> v_col));
    end if;
  end loop;
  if old.description is distinct from new.description then
    v_diff := v_diff || jsonb_build_object('description', jsonb_build_array(null, null));
  end if;

  if v_diff = '{}'::jsonb then
    return null; -- position-only changes are not interesting
  end if;

  perform public.log_activity(new.workspace_id, new.project_id, new.id, 'task', new.id,
    case when v_diff ? 'status' and new.status = 'done' then 'completed' else 'updated' end,
    v_diff || jsonb_build_object('_title', new.title));
  return null;
end;
$$;

create trigger task_activity after insert or update on public.tasks
  for each row execute function public.on_task_activity();

create function public.on_project_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_diff jsonb := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.workspace_id, new.id, null, 'project', new.id, 'created',
      jsonb_build_object('name', new.name));
    return null;
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.log_activity(new.workspace_id, new.id, null, 'project', new.id, 'deleted',
      jsonb_build_object('name', new.name));
    return null;
  end if;
  if old.name is distinct from new.name then
    v_diff := v_diff || jsonb_build_object('name', jsonb_build_array(old.name, new.name));
  end if;
  if old.status is distinct from new.status then
    v_diff := v_diff || jsonb_build_object('status', jsonb_build_array(old.status, new.status));
  end if;
  if old.health is distinct from new.health then
    v_diff := v_diff || jsonb_build_object('health', jsonb_build_array(old.health, new.health));
  end if;
  if old.target_date is distinct from new.target_date then
    v_diff := v_diff || jsonb_build_object('target_date', jsonb_build_array(old.target_date, new.target_date));
  end if;
  if v_diff <> '{}'::jsonb then
    perform public.log_activity(new.workspace_id, new.id, null, 'project', new.id, 'updated',
      v_diff || jsonb_build_object('_name', new.name));
  end if;
  return null;
end;
$$;

create trigger project_activity after insert or update on public.projects
  for each row execute function public.on_project_activity();

-- ================================================================ notifications

create function public.notify(
  p_user uuid, p_type public.notification_type, p_task uuid, p_project uuid, p_ws uuid,
  p_title text, p_body text, p_url text, p_data jsonb default '{}'
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null or p_user = auth.uid() then
    return; -- never notify people about their own actions
  end if;
  if p_task is not null and not public.can_read_task(p_task, p_user) then
    return;
  end if;
  insert into public.notifications (user_id, type, actor_id, task_id, project_id, workspace_id, title, body, url, data)
  values (p_user, p_type, auth.uid(), p_task, p_project, p_ws, p_title, p_body, p_url, coalesce(p_data, '{}'));
end;
$$;

create function public.on_assignee_added()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = new.task_id;
  perform public.notify(new.user_id, 'assigned', t.id, t.project_id, t.workspace_id, t.title, null, '/tasks/' || t.id);
  perform public.log_activity(t.workspace_id, t.project_id, t.id, 'task', t.id, 'assigned',
    jsonb_build_object('user_id', new.user_id, '_title', t.title));
  return null;
end;
$$;

create trigger assignee_added after insert on public.task_assignees
  for each row execute function public.on_assignee_added();

create function public.on_task_created_watch()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.created_by is not null and new.project_id is not null then
    insert into public.task_watchers (task_id, user_id, workspace_id)
    values (new.id, new.created_by, new.workspace_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger task_created_watch after insert on public.tasks
  for each row execute function public.on_task_created_watch();

create function public.task_audience(p_task uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select user_id from public.task_assignees where task_id = p_task
  union
  select user_id from public.task_watchers where task_id = p_task
  union
  select created_by from public.tasks where id = p_task and created_by is not null
$$;

create function public.on_task_status_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid;
begin
  if new.project_id is null then
    return null;
  end if;
  for v_uid in select * from public.task_audience(new.id) loop
    perform public.notify(v_uid, 'status_change', new.id, new.project_id, new.workspace_id, new.title,
      new.status::text, '/tasks/' || new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end loop;
  return null;
end;
$$;

create trigger task_status_notify after update of status on public.tasks
  for each row when (old.status is distinct from new.status)
  execute function public.on_task_status_notify();

create function public.on_comment_created()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t public.tasks;
  v_uid uuid;
  v_snippet text := left(new.body_text, 200);
begin
  select * into t from public.tasks where id = new.task_id;

  insert into public.task_watchers (task_id, user_id, workspace_id)
  values (t.id, new.author_id, t.workspace_id) on conflict do nothing;

  for v_uid in select distinct unnest(new.mentions) loop
    perform public.notify(v_uid, 'mentioned', t.id, t.project_id, t.workspace_id, t.title, v_snippet,
      '/tasks/' || t.id || '#comment-' || new.id);
  end loop;

  for v_uid in select * from public.task_audience(t.id) loop
    if not (v_uid = any (new.mentions)) then
      perform public.notify(v_uid, 'comment', t.id, t.project_id, t.workspace_id, t.title, v_snippet,
        '/tasks/' || t.id || '#comment-' || new.id);
    end if;
  end loop;

  perform public.log_activity(t.workspace_id, t.project_id, t.id, 'comment', new.id, 'commented',
    jsonb_build_object('_title', t.title, 'snippet', left(new.body_text, 120)));
  return null;
end;
$$;

create trigger comment_created after insert on public.comments
  for each row execute function public.on_comment_created();

-- ================================================================ RPCs for the app

create function public.get_invitation(p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'workspace_name', w.name,
    'project_name', p.name,
    'project_id', i.project_id,
    'workspace_id', i.workspace_id,
    'role', i.role,
    'inviter_name', pr.name,
    'email', i.email,
    'valid', i.revoked_at is null and i.expires_at > now()
             and (i.max_uses is null or i.use_count < i.max_uses)
             and (i.email is null or i.accepted_at is null)
  )
  from public.invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.projects p on p.id = i.project_id
  left join public.profiles pr on pr.id = i.created_by
  where i.token = p_token
$$;

create function public.accept_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invitations;
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_existing public.workspace_role;
  v_rank_new int;
  v_rank_old int;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into inv from public.invitations where token = p_token for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if inv.revoked_at is not null or inv.expires_at <= now()
     or (inv.max_uses is not null and inv.use_count >= inv.max_uses)
     or (inv.email is not null and inv.accepted_at is not null) then
    raise exception 'invitation_expired' using errcode = '22023';
  end if;
  if inv.email is not null and lower(inv.email) <> lower(coalesce(v_email, '')) then
    raise exception 'invitation_wrong_email' using errcode = '42501';
  end if;

  select role into v_existing from public.workspace_members
  where workspace_id = inv.workspace_id and user_id = v_uid;

  if inv.project_id is null then
    v_rank_new := case inv.role when 'admin' then 3 when 'member' then 2 else 1 end;
    v_rank_old := case v_existing when 'owner' then 4 when 'admin' then 3 when 'member' then 2 when 'guest' then 1 else 0 end;
    if v_rank_new > v_rank_old then
      insert into public.workspace_members (workspace_id, user_id, role)
      values (inv.workspace_id, v_uid, inv.role::public.workspace_role)
      on conflict (workspace_id, user_id) do update set role = excluded.role;
    end if;
  else
    if v_existing is null then
      insert into public.workspace_members (workspace_id, user_id, role)
      values (inv.workspace_id, v_uid, 'guest');
    end if;
    insert into public.project_members (project_id, user_id, workspace_id, role)
    values (inv.project_id, v_uid, inv.workspace_id, inv.role::public.project_role)
    on conflict (project_id, user_id) do update set role = excluded.role;
  end if;

  update public.invitations
  set use_count = use_count + 1, accepted_at = coalesce(accepted_at, now()), accepted_by = coalesce(accepted_by, v_uid)
  where id = inv.id;

  perform public.notify(inv.created_by, 'invite', null, inv.project_id, inv.workspace_id,
    coalesce((select name from public.profiles where id = v_uid), ''), 'accepted',
    case when inv.project_id is null then '/overview' else '/projects/' || inv.project_id end);

  return jsonb_build_object('workspace_id', inv.workspace_id, 'project_id', inv.project_id);
end;
$$;

create function public.regenerate_ics_token()
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_token text := public.new_token(40);
begin
  update public.profiles set ics_token = v_token where id = auth.uid();
  return v_token;
end;
$$;

create function public.create_telegram_link_code()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
  v_recent int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select count(*) into v_recent from public.telegram_link_codes
  where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  delete from public.telegram_link_codes where user_id = auth.uid() and used_at is null;
  v_code := upper(public.new_token(8));
  insert into public.telegram_link_codes (user_id, code) values (auth.uid(), v_code);
  return v_code;
end;
$$;

create function public.unlink_telegram()
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set telegram_chat_id = null, telegram_username = null where id = auth.uid()
$$;

-- service role: complete the Telegram link started in Settings
create function public.link_telegram(p_code text, p_chat_id bigint, p_username text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid;
begin
  update public.telegram_link_codes
  set used_at = now()
  where code = upper(p_code) and used_at is null and expires_at > now()
  returning user_id into v_uid;
  if v_uid is null then
    return null;
  end if;
  update public.profiles set telegram_chat_id = null, telegram_username = null
  where telegram_chat_id = p_chat_id and id <> v_uid;
  update public.profiles set telegram_chat_id = p_chat_id, telegram_username = p_username where id = v_uid;
  return v_uid;
end;
$$;

-- service role: atomically claim reminders that are due. Each row is returned to exactly one caller.
create function public.claim_due_reminders(p_limit int default 200)
returns setof public.reminders
language sql security definer set search_path = ''
as $$
  update public.reminders r
  set status = 'sending', claimed_at = now(), attempts = r.attempts + 1
  where r.id in (
    select id from public.reminders
    where (status in ('pending', 'snoozed') and remind_at <= now())
       -- recover rows left in 'sending' by a crashed run
       or (status = 'sending' and claimed_at < now() - interval '10 minutes' and attempts < 3)
    order by remind_at
    limit p_limit
    for update skip locked
  )
  returning r.*
$$;

create function public.claim_pending_notifications(p_limit int default 200)
returns setof public.notifications
language sql security definer set search_path = ''
as $$
  update public.notifications n
  set delivery = 'sending'
  where n.id in (
    select id from public.notifications
    where delivery = 'pending' and deliver_after <= now()
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning n.*
$$;

-- service role: claim the daily digest / weekly review / overdue nudge for a user and local date.
-- Returns true only for the first caller for that (user, kind, date).
create function public.claim_daily_slot(p_user uuid, p_kind text, p_date date)
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
  else
    raise exception 'unknown slot %', p_kind;
  end if;
  return v_id is not null;
end;
$$;

-- service role: fixed-window rate limit. Returns true when the call is allowed.
create function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_count int;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

-- service role: daily housekeeping
create function public.purge_expired()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.tasks where deleted_at < now() - interval '30 days';
  delete from public.projects where deleted_at < now() - interval '30 days';
  delete from public.sections where deleted_at < now() - interval '30 days';
  delete from public.comments where deleted_at < now() - interval '30 days';
  delete from public.notes where deleted_at < now() - interval '30 days';
  delete from public.goals where deleted_at < now() - interval '30 days';
  delete from public.labels where deleted_at < now() - interval '30 days';
  delete from public.attachments where deleted_at < now() - interval '30 days';
  delete from public.activity_log where created_at < now() - interval '12 months';
  delete from public.notifications where created_at < now() - interval '6 months';
  delete from public.telegram_link_codes where expires_at < now() - interval '1 day';
  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from public.reminders where status in ('sent', 'dismissed', 'failed') and remind_at < now() - interval '90 days';
end;
$$;

-- ================================================================ function privileges

revoke execute on function
  public.link_telegram(text, bigint, text),
  public.claim_due_reminders(int),
  public.claim_pending_notifications(int),
  public.claim_daily_slot(uuid, text, date),
  public.hit_rate_limit(text, int, int),
  public.purge_expired(),
  public.sync_task_reminders(uuid),
  public.notify(uuid, public.notification_type, uuid, uuid, uuid, text, text, text, jsonb),
  public.log_activity(uuid, uuid, uuid, text, uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function
  public.link_telegram(text, bigint, text),
  public.claim_due_reminders(int),
  public.claim_pending_notifications(int),
  public.claim_daily_slot(uuid, text, date),
  public.hit_rate_limit(text, int, int),
  public.purge_expired(),
  public.sync_task_reminders(uuid)
to service_role;

revoke execute on function public.accept_invitation(text), public.regenerate_ics_token(),
  public.create_telegram_link_code(), public.unlink_telegram()
from public, anon;
grant execute on function public.accept_invitation(text), public.regenerate_ics_token(),
  public.create_telegram_link_code(), public.unlink_telegram()
to authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
