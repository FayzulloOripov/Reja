-- pglite:skip  (realtime publication exists only on Supabase)
alter publication supabase_realtime add table
  public.contacts, public.meetings, public.meeting_attendees, public.meeting_items,
  public.weekly_reviews, public.daily_shutdowns, public.routines, public.routine_runs;
