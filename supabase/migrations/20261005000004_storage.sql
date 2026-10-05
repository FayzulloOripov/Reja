-- pglite:skip  (storage schema exists only on Supabase)
-- Private bucket for task attachments. Object path: {workspace_id}/{task_id}/{uuid}-{filename}

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do nothing;

create policy "attachments_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.can_read_task(((storage.foldername(name))[2])::uuid)
  );

create policy "attachments_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.can_write_task(((storage.foldername(name))[2])::uuid)
  );

create policy "attachments_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.can_write_task(((storage.foldername(name))[2])::uuid)
  );
