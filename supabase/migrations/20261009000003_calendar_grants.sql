-- Supabase grants new tables to the client roles by default; calendar events are written only by
-- the server (RLS already blocked client writes — this makes the privilege match).
revoke insert, update, delete, truncate, references, trigger on public.calendar_events from authenticated, anon;
