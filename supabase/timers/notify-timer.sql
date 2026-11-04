-- The five-minute timer behind the optional notifications. See "Notifications timer" in docs/SETUP.md.
--
-- This isn't a migration, because it holds a secret and only belongs on the live project.
-- Before running it in Supabase's SQL editor, replace PASTE_CRON_SECRET_HERE below with your CRON_SECRET.
-- Don't save the file with the secret in it. Running this again safely replaces the old timer and secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The secret lives encrypted in Supabase Vault, so it never appears in the timer's own definition.
delete from vault.secrets where name = 'cron_secret';
select vault.create_secret('PASTE_CRON_SECRET_HERE', 'cron_secret', 'Lets the database timer call the app');

select cron.schedule(
  'notify-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://my-schedule-manager-woad.vercel.app/api/cron/notify',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 10000
  );
  $$
);

-- The timer keeps a row for every run. A week of them is plenty to see whether it's working.
select cron.schedule(
  'clean-timer-history',
  '30 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$
);

-- Should list both timers. To see whether they're running: select * from cron.job_run_details order by start_time desc limit 5;
select jobname, schedule, active from cron.job;
