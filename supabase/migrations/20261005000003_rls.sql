-- Row Level Security. Every table is locked down; access flows through the helpers in 0002.
-- anon gets nothing; the service role bypasses RLS and is used only on the server.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- profiles
-- Users may edit their own preferences, but not server-managed columns
-- (telegram link, ICS token, digest bookkeeping). Those change through RPCs.
revoke insert, update, delete on public.profiles from authenticated;
grant update (
  name, avatar_url, timezone, language, theme, work_days, quiet_enabled, quiet_start, quiet_end,
  digest_enabled, digest_time, review_enabled, review_dow, review_time, overdue_nudge_enabled,
  default_reminder, notify_prefs, onboarded_at, current_workspace_id, pomodoro_work, pomodoro_break
) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (public.shares_space_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (current_workspace_id is null or public.is_ws_member(current_workspace_id))
  );

-- ---------------------------------------------------------------- workspaces
create policy workspaces_select on public.workspaces for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_ws_member(id));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()) and not is_personal);
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_ws_admin(id))
  with check (public.is_ws_admin(id));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (owner_id = (select auth.uid()) and not is_personal);

create policy workspace_members_select on public.workspace_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_ws_full_member(workspace_id)
    or public.shares_space_with(user_id)
  );
create policy workspace_members_insert on public.workspace_members for insert to authenticated
  with check (public.is_ws_admin(workspace_id));
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (public.is_ws_admin(workspace_id))
  with check (public.is_ws_admin(workspace_id));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (public.is_ws_admin(workspace_id) or user_id = (select auth.uid()));

create policy invitations_select on public.invitations for select to authenticated
  using (
    public.is_ws_admin(workspace_id)
    or (project_id is not null and public.can_manage_project(project_id))
  );
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (project_id is null and public.is_ws_admin(workspace_id))
      or (project_id is not null and public.can_manage_project(project_id))
    )
  );
create policy invitations_update on public.invitations for update to authenticated
  using (
    public.is_ws_admin(workspace_id)
    or (project_id is not null and public.can_manage_project(project_id))
  );
create policy invitations_delete on public.invitations for delete to authenticated
  using (
    public.is_ws_admin(workspace_id)
    or (project_id is not null and public.can_manage_project(project_id))
  );

-- ---------------------------------------------------------------- projects
-- owner_id covers INSERT ... RETURNING, where the new row is not yet visible to the helper
create policy projects_select on public.projects for select to authenticated
  using ((owner_id = (select auth.uid()) and public.is_ws_member(workspace_id)) or public.can_read_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_ws_full_member(workspace_id) and owner_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (public.can_write_project(id))
  with check (public.is_ws_member(workspace_id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.can_manage_project(id));

create policy project_members_select on public.project_members for select to authenticated
  using (public.can_read_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (public.can_manage_project(project_id) and public.is_ws_member(workspace_id, user_id));
create policy project_members_update on public.project_members for update to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (public.can_manage_project(project_id) or user_id = (select auth.uid()));

create policy project_favorites_all on public.project_favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_read_project(project_id));

create policy sections_select on public.sections for select to authenticated
  using (public.can_read_project(project_id));
create policy sections_write on public.sections for insert to authenticated
  with check (public.can_write_project(project_id));
create policy sections_update on public.sections for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));
create policy sections_delete on public.sections for delete to authenticated
  using (public.can_write_project(project_id));

-- ---------------------------------------------------------------- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (
    case when project_id is null then created_by = (select auth.uid())
         else public.can_read_project(project_id) end
  );
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    case when project_id is null
         then (created_by = (select auth.uid()) or created_by is null) and public.is_ws_member(workspace_id)
         else public.can_write_project(project_id) end
  );
create policy tasks_update on public.tasks for update to authenticated
  using (
    case when project_id is null then created_by = (select auth.uid())
         else public.can_write_project(project_id) end
  )
  with check (
    case when project_id is null then created_by = (select auth.uid()) and public.is_ws_member(workspace_id)
         else public.can_write_project(project_id) end
  );
create policy tasks_delete on public.tasks for delete to authenticated
  using (
    case when project_id is null then created_by = (select auth.uid())
         else public.can_write_project(project_id) end
  );

-- children of tasks
do $$
declare t text;
begin
  foreach t in array array['task_assignees', 'task_labels', 'checklist_items', 'attachments'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (public.can_read_task(task_id));
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (public.can_write_task(task_id));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (public.can_write_task(task_id)) with check (public.can_write_task(task_id));
      create policy %1$s_delete on public.%1$I for delete to authenticated
        using (public.can_write_task(task_id));
    $f$, t);
  end loop;
end $$;

-- assignees must be able to see the task
alter policy task_assignees_insert on public.task_assignees
  with check (public.can_write_task(task_id) and public.can_read_task(task_id, user_id));

create policy task_watchers_select on public.task_watchers for select to authenticated
  using (public.can_read_task(task_id));
create policy task_watchers_insert on public.task_watchers for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and public.can_read_task(task_id))
    or (public.can_write_task(task_id) and public.can_read_task(task_id, user_id))
  );
create policy task_watchers_delete on public.task_watchers for delete to authenticated
  using (user_id = (select auth.uid()) or public.can_write_task(task_id));

create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using (public.can_read_task(blocked_id) and public.can_read_task(blocker_id));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check (public.can_write_task(blocked_id) and public.can_read_task(blocker_id));
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
  using (public.can_write_task(blocked_id));

create policy time_entries_select on public.time_entries for select to authenticated
  using (public.can_read_task(task_id));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_write_task(task_id));
create policy time_entries_update on public.time_entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy time_entries_delete on public.time_entries for delete to authenticated
  using (user_id = (select auth.uid()));

create policy labels_select on public.labels for select to authenticated
  using (public.is_ws_member(workspace_id));
create policy labels_insert on public.labels for insert to authenticated
  with check (public.is_ws_full_member(workspace_id));
create policy labels_update on public.labels for update to authenticated
  using (public.is_ws_full_member(workspace_id)) with check (public.is_ws_full_member(workspace_id));
create policy labels_delete on public.labels for delete to authenticated
  using (public.is_ws_full_member(workspace_id));

create policy comments_select on public.comments for select to authenticated
  using (public.can_read_task(task_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_write_task(task_id));
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select auth.uid()));

create policy comment_reactions_select on public.comment_reactions for select to authenticated
  using (exists (select 1 from public.comments c where c.id = comment_id));
create policy comment_reactions_insert on public.comment_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.comments c where c.id = comment_id and public.can_write_task(c.task_id))
  );
create policy comment_reactions_delete on public.comment_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- reminders, notifications, activity
create policy reminders_all on public.reminders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (task_id is null or public.can_read_task(task_id)));

revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.activity_log from authenticated;
create policy activity_select on public.activity_log for select to authenticated
  using (
    case
      when task_id is not null then public.can_read_task(task_id)
      when project_id is not null then public.can_read_project(project_id)
      else public.is_ws_full_member(workspace_id)
    end
  );

-- ---------------------------------------------------------------- goals, notes
create policy goals_select on public.goals for select to authenticated
  using (
    case when project_id is null then public.is_ws_full_member(workspace_id)
         else public.can_read_project(project_id) end
  );
create policy goals_insert on public.goals for insert to authenticated
  with check (
    case when project_id is null then public.is_ws_full_member(workspace_id)
         else public.can_write_project(project_id) end
  );
create policy goals_update on public.goals for update to authenticated
  using (public.can_write_goal(id))
  with check (
    case when project_id is null then public.is_ws_full_member(workspace_id)
         else public.can_write_project(project_id) end
  );
create policy goals_delete on public.goals for delete to authenticated
  using (public.can_write_goal(id));

create policy key_results_select on public.key_results for select to authenticated
  using (public.can_read_goal(goal_id));
create policy key_results_insert on public.key_results for insert to authenticated
  with check (public.can_write_goal(goal_id));
create policy key_results_update on public.key_results for update to authenticated
  using (public.can_write_goal(goal_id)) with check (public.can_write_goal(goal_id));
create policy key_results_delete on public.key_results for delete to authenticated
  using (public.can_write_goal(goal_id));

create policy kr_history_select on public.key_result_history for select to authenticated
  using (exists (select 1 from public.key_results k where k.id = key_result_id and public.can_read_goal(k.goal_id)));
create policy kr_history_insert on public.key_result_history for insert to authenticated
  with check (exists (select 1 from public.key_results k where k.id = key_result_id and public.can_write_goal(k.goal_id)));

create policy notes_select on public.notes for select to authenticated
  using (public.can_read_project(project_id));
create policy notes_insert on public.notes for insert to authenticated
  with check (public.can_write_project(project_id));
create policy notes_update on public.notes for update to authenticated
  using (public.can_write_project(project_id)) with check (public.can_write_project(project_id));
create policy notes_delete on public.notes for delete to authenticated
  using (public.can_write_project(project_id));

-- ---------------------------------------------------------------- private to the owner
create policy habits_owner on public.habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy habit_logs_owner on public.habit_logs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))
  );
create policy time_blocks_owner on public.time_blocks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (task_id is null or public.can_read_task(task_id)));
create policy push_subscriptions_owner on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke insert, update on public.telegram_link_codes from authenticated;
create policy telegram_codes_owner on public.telegram_link_codes for select to authenticated
  using (user_id = (select auth.uid()));
create policy telegram_codes_delete on public.telegram_link_codes for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- views, templates
create policy saved_views_select on public.saved_views for select to authenticated
  using (user_id = (select auth.uid()) or (user_id is null and public.is_ws_member(workspace_id)));
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (
    public.is_ws_member(workspace_id)
    and (user_id = (select auth.uid()) or (user_id is null and public.is_ws_full_member(workspace_id)))
  );
create policy saved_views_update on public.saved_views for update to authenticated
  using (user_id = (select auth.uid()) or (user_id is null and public.is_ws_full_member(workspace_id)))
  with check (user_id = (select auth.uid()) or (user_id is null and public.is_ws_full_member(workspace_id)));
create policy saved_views_delete on public.saved_views for delete to authenticated
  using (user_id = (select auth.uid()) or (user_id is null and public.is_ws_admin(workspace_id)));

create policy templates_select on public.templates for select to authenticated
  using (public.is_ws_full_member(workspace_id));
create policy templates_insert on public.templates for insert to authenticated
  with check (public.is_ws_full_member(workspace_id));
create policy templates_update on public.templates for update to authenticated
  using (public.is_ws_full_member(workspace_id)) with check (public.is_ws_full_member(workspace_id));
create policy templates_delete on public.templates for delete to authenticated
  using (public.is_ws_full_member(workspace_id));

-- rate_limits: no policies → no access except service role
revoke all on public.rate_limits from authenticated;
