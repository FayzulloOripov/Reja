-- Deleting an account (Supabase dashboard, admin API, or a future "delete my account") used to
-- fail for anyone who owned a workspace (workspaces.owner_id had no delete rule). Now:
--   • the personal workspace is deleted with the account;
--   • a shared workspace passes to another admin, else another member; it is deleted only when
--     nobody else is left in it.
-- Runs on auth.users (before the profile is removed by its cascade), because changing workspaces
-- from inside the profile's own delete would touch the row being deleted (current_workspace_id).
create or replace function public.before_account_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  w record;
  v_heir uuid;
begin
  for w in select id, is_personal from public.workspaces where owner_id = old.id loop
    v_heir := null;
    if not w.is_personal then
      select m.user_id into v_heir
      from public.workspace_members m
      where m.workspace_id = w.id and m.user_id <> old.id and m.role in ('admin', 'member')
      order by case m.role when 'admin' then 0 else 1 end, m.created_at
      limit 1;
    end if;
    if v_heir is null then
      delete from public.workspaces where id = w.id;
    else
      -- owner first: the member guard only allows the owner role for the workspace's owner
      update public.workspaces set owner_id = v_heir where id = w.id;
      update public.workspace_members set role = 'owner' where workspace_id = w.id and user_id = v_heir;
    end if;
  end loop;
  return old;
end;
$$;

create trigger before_account_delete before delete on auth.users
  for each row execute function public.before_account_delete();
