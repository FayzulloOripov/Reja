-- pglite:skip  (realtime schema and publication exist only on Supabase)
-- postgres_changes respects RLS: each subscriber only receives rows its select policy allows.

alter publication supabase_realtime add table
  public.workspaces, public.workspace_members, public.projects, public.project_members,
  public.project_favorites, public.sections, public.tasks, public.task_assignees,
  public.task_watchers, public.task_dependencies, public.labels, public.task_labels,
  public.checklist_items, public.comments, public.comment_reactions, public.attachments,
  public.notifications, public.goals, public.key_results, public.notes, public.reminders,
  public.habits, public.habit_logs, public.time_blocks, public.time_entries, public.profiles;

-- Private broadcast/presence channels ("project:<uuid>") are authorised per project.
create policy "project_channel_read" on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'project:%'
    and public.can_read_project((split_part(realtime.topic(), ':', 2))::uuid)
  );

create policy "project_channel_write" on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'project:%'
    and public.can_read_project((split_part(realtime.topic(), ':', 2))::uuid)
  );
