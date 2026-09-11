-- FlemiCoach - exemple de planification du rappel email toutes les heures.
-- 1) Activez les extensions pg_cron et pg_net dans Supabase.
-- 2) Remplacez les 3 valeurs ci-dessous.
-- 3) Exécutez dans SQL Editor.

select vault.create_secret('https://YOUR_PROJECT.supabase.co', 'flemicoach_project_url');
select vault.create_secret('sb_publishable_YOUR_KEY', 'flemicoach_publishable_key');
select vault.create_secret('CHANGE_ME_LONG_RANDOM_SECRET', 'flemicoach_cron_secret');

select cron.schedule(
  'flemicoach-send-reminders-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='flemicoach_project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='flemicoach_publishable_key'),
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='flemicoach_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
