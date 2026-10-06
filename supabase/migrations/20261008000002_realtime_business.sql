-- pglite:skip  (realtime publication exists only on Supabase)
alter publication supabase_realtime add table
  public.deal_stages, public.deals, public.deal_stage_history, public.money_entries, public.note_versions, public.note_tasks;
