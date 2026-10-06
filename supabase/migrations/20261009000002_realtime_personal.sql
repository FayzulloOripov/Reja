-- pglite:skip  (realtime publication exists only on Supabase)
alter publication supabase_realtime add table public.calendar_events;
