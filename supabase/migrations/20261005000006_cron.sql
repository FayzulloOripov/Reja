-- pglite:skip  (pg_cron, pg_net and vault exist only on Supabase)
-- Minute-level scheduling: pg_cron calls the Next.js endpoint through pg_net.
-- After deploying, run once in the SQL editor:
--   select public.setup_reminder_cron('https://<your-app>.vercel.app/api/cron/reminders', '<CRON_SECRET>');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.setup_reminder_cron(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  select id into v_secret_id from vault.secrets where name = 'reja_cron_secret';
  if v_secret_id is null then
    perform vault.create_secret(p_secret, 'reja_cron_secret', 'Bearer secret for /api/cron/reminders');
  else
    perform vault.update_secret(v_secret_id, p_secret);
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname in ('reja-reminders', 'reja-purge');

  perform cron.schedule(
    'reja-reminders',
    '* * * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reja_cron_secret')
        ),
        body := jsonb_build_object('at', now()),
        timeout_milliseconds := 25000
      )
      $job$,
      p_url
    )
  );

  perform cron.schedule('reja-purge', '17 22 * * *', 'select public.purge_expired()');
end;
$$;

revoke execute on function public.setup_reminder_cron(text, text) from public, anon, authenticated;
