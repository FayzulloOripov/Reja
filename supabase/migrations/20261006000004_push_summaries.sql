-- Telegram is postponed: the daily digest, weekly review and overdue nudge also go out by web push.
alter table public.profiles alter column notify_prefs set default '{
  "in_app":   {"assigned": true, "mentioned": true, "comment": true, "status_change": true, "invite": true, "reminder": true, "due_soon": true, "overdue": true},
  "telegram": {"assigned": true, "mentioned": true, "comment": false, "status_change": false, "invite": true, "reminder": true, "due_soon": true, "overdue": true, "digest": true, "review": true},
  "push":     {"assigned": true, "mentioned": true, "comment": true, "status_change": false, "invite": true, "reminder": true, "due_soon": true, "overdue": true, "digest": true, "review": true},
  "email":    {"assigned": false, "mentioned": true, "comment": false, "status_change": false, "invite": true, "reminder": false, "due_soon": false, "overdue": false, "digest": false, "review": false}
}'::jsonb;

-- existing users: turn the summaries on for push unless they already chose
update public.profiles
set notify_prefs = jsonb_set(
  notify_prefs,
  '{push}',
  coalesce(notify_prefs -> 'push', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'digest', case when notify_prefs -> 'push' ? 'digest' then null else true end,
    'review', case when notify_prefs -> 'push' ? 'review' then null else true end
  ))
);
