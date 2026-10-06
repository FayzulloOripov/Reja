-- Round 2, phase 8: sessions and devices, audit log for admins, weekly backups.

-- ---------------------------------------------------------------- sessions & devices
-- The signed-in user's own sessions (Supabase keeps them in auth.sessions).
create function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_active_at timestamptz, user_agent text, ip text, current boolean)
language sql stable security definer set search_path = ''
as $$
  select s.id,
         s.created_at,
         greatest(s.updated_at, s.refreshed_at::timestamptz),
         s.user_agent,
         host(s.ip),
         s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s
  where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
  order by 3 desc nulls last
$$;

-- Sign out one other device (its refresh tokens go with the session; the device is signed out at
-- its next token refresh, within the hour). The current session cannot be ended this way.
create function public.end_session(p_session uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  delete from auth.sessions s
  where s.id = p_session and s.user_id = auth.uid() and s.id::text <> coalesce(auth.jwt() ->> 'session_id', '')
  returning s.id into v_id;
  return v_id is not null;
end;
$$;

create function public.end_other_sessions()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  delete from auth.sessions s where s.user_id = auth.uid() and s.id::text <> coalesce(auth.jwt() ->> 'session_id', '');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.my_sessions(), public.end_session(uuid), public.end_other_sessions() from public, anon;
grant execute on function public.my_sessions(), public.end_session(uuid), public.end_other_sessions() to authenticated;

-- ---------------------------------------------------------------- audit log (workspace admins)
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_log (workspace_id, created_at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
create policy audit_log_admins on public.audit_log for select to authenticated using (public.is_ws_admin(workspace_id));

create function public.audit(p_workspace uuid, p_action text, p_type text, p_target uuid, p_details jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- nothing to record for a workspace that is being deleted
  if not exists (select 1 from public.workspaces w where w.id = p_workspace) then
    return;
  end if;
  insert into public.audit_log (workspace_id, actor_id, action, target_type, target_id, details)
  values (p_workspace, auth.uid(), p_action, p_type, p_target, coalesce(p_details, '{}'));
end;
$$;
revoke execute on function public.audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

create function public.audit_members()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_name text;
begin
  select p.name into v_name from public.profiles p where p.id = coalesce(new.user_id, old.user_id);
  if tg_op = 'INSERT' then
    -- the owner's own membership is the workspace being created, not a change
    if new.role = 'owner' then
      return null;
    end if;
    perform public.audit(new.workspace_id, 'member_added', 'member', new.user_id, jsonb_build_object('name', v_name, 'role', new.role));
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    perform public.audit(new.workspace_id, 'role_changed', 'member', new.user_id, jsonb_build_object('name', v_name, 'from', old.role, 'to', new.role));
  elsif tg_op = 'DELETE' then
    perform public.audit(old.workspace_id, 'member_removed', 'member', old.user_id, jsonb_build_object('name', v_name, 'role', old.role));
  end if;
  return null;
end;
$$;
create trigger audit_members after insert or update of role or delete on public.workspace_members for each row execute function public.audit_members();

create function public.audit_projects()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.audit(old.workspace_id, 'project_deleted_forever', 'project', old.id, jsonb_build_object('name', old.name));
  elsif new.deleted_at is not null and old.deleted_at is null then
    perform public.audit(new.workspace_id, 'project_deleted', 'project', new.id, jsonb_build_object('name', new.name));
  elsif new.deleted_at is null and old.deleted_at is not null then
    perform public.audit(new.workspace_id, 'project_restored', 'project', new.id, jsonb_build_object('name', new.name));
  end if;
  return null;
end;
$$;
create trigger audit_projects after update of deleted_at or delete on public.projects for each row execute function public.audit_projects();

create function public.audit_workspace_settings()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.modules is distinct from old.modules then
    perform public.audit(new.id, 'modules_changed', 'workspace', new.id, jsonb_build_object('from', old.modules, 'to', new.modules));
  end if;
  if (new.approval_threshold_uzs, new.money_split, new.usd_rate) is distinct from (old.approval_threshold_uzs, old.money_split, old.usd_rate) then
    perform public.audit(new.id, 'money_settings_changed', 'workspace', new.id,
      jsonb_build_object('threshold', new.approval_threshold_uzs, 'usd_rate', new.usd_rate, 'split', new.money_split));
  end if;
  return null;
end;
$$;
create trigger audit_workspace_settings after update on public.workspaces for each row execute function public.audit_workspace_settings();

create function public.audit_invitations()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit(new.workspace_id, 'invite_created', 'invitation', new.id, jsonb_build_object('role', new.role, 'email', new.email));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform public.audit(new.workspace_id, 'invite_revoked', 'invitation', new.id, jsonb_build_object('role', new.role, 'email', new.email));
  end if;
  return null;
end;
$$;
create trigger audit_invitations after insert or update of revoked_at on public.invitations for each row execute function public.audit_invitations();

create function public.audit_money_decisions()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') and old.status = 'pending' then
    perform public.audit(new.workspace_id, case when new.status = 'approved' then 'expense_approved' else 'expense_rejected' end, 'money_entry', new.id,
      jsonb_build_object('amount', new.amount, 'currency', new.currency, 'note', new.note));
  end if;
  return null;
end;
$$;
create trigger audit_money_decisions after update of status on public.money_entries for each row execute function public.audit_money_decisions();

-- Exports are recorded by the export route (any member may export what they can see).
create function public.log_export(p_workspace uuid, p_format text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_ws_member(p_workspace) then
    raise exception 'Not a member' using errcode = '42501';
  end if;
  perform public.audit(p_workspace, 'data_exported', 'workspace', p_workspace, jsonb_build_object('format', p_format));
end;
$$;
revoke execute on function public.log_export(uuid, text) from public, anon;
grant execute on function public.log_export(uuid, text) to authenticated;

-- ---------------------------------------------------------------- weekly backups
alter table public.profiles
  add column backup_enabled boolean not null default true,
  add column last_backup_on date;
grant update (backup_enabled) on public.profiles to authenticated;

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
  elsif p_kind = 'backup' then
    update public.profiles set last_backup_on = p_date
    where id = p_user and (last_backup_on is null or last_backup_on < p_date) returning id into v_id;
  else
    raise exception 'unknown slot %', p_kind;
  end if;
  return v_id is not null;
end;
$$;
