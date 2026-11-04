-- Phase 7: repeating events, calendar files, the weekly review's answers and push notifications.

-- A repeating event is one row plus its rule. exdates holds the single dates taken out of the series.
-- ics_uid remembers where an imported event came from, so importing the same file twice adds nothing.
alter table public.events
  add column rrule text check (rrule is null or length(rrule) <= 300),
  add column exdates date[] not null default '{}',
  add column ics_uid text check (ics_uid is null or length(ics_uid) <= 500);

create unique index events_ics_uid_idx on public.events (user_id, ics_uid) where ics_uid is not null;
create index events_repeating_idx on public.events (user_id) where rrule is not null;

-- The three prompts the owner answers each week, next to the Oracle's written review.
alter table public.weekly_reviews
  add column worked text not null default '' check (length(worked) <= 4000),
  add column didnt text not null default '' check (length(didnt) <= 4000),
  add column focus text not null default '' check (length(focus) <= 4000);

-- Only the Sunday review is on until the owner chooses otherwise.
alter table public.settings
  add column notify_weekly boolean not null default true,
  add column notify_block_start boolean not null default false,
  add column notify_open_blocks boolean not null default false,
  add column notify_low_power boolean not null default false;

-- One row per device that agreed to receive notifications.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- What has been sent already, so the five-minute timer never repeats itself.
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('weekly', 'block_start', 'open_blocks', 'low_power')),
  key text not null check (length(key) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, key)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['push_subscriptions', 'notification_log'] loop
    execute format(
      'create trigger %1$I before update on public.%2$I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format(
      'create policy %1$I on public.%2$I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)',
      table_name || '_own_rows', table_name
    );
  end loop;
end;
$$;

-- Timers and restoring a backup use the server's secret key. Supabase's defaults for what that key can reach have been
-- changing, so this says it plainly instead of relying on them. Row-level rules don't apply to it, so it stays server only.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;

-- Puts a backup back: everything of the owner's goes, and the file's rows take its place, as one unit.
-- If any row breaks a rule, the whole thing is undone and nothing has changed. Only the server's secret key may run it.
-- The list must match BACKUP_TABLES in src/features/backup/logic.ts. Anything a table points at comes before it.
create function public.restore_backup(owner_id uuid, backup jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  restore_order constant text[] := array[
    'settings', 'audit_log', 'loop_templates', 'template_activations', 'learning_tracks', 'template_blocks',
    'events', 'block_instances', 'rest_days', 'game_state', 'game_ledger', 'closed_days', 'daily_summaries',
    'goals', 'projects', 'learning_units', 'tasks', 'progress_snapshots', 'habits', 'habit_checkins',
    'widget_layouts', 'ai_conversations', 'ai_messages', 'ai_proposals', 'ai_actions', 'ai_suggestions',
    'weekly_reviews', 'fin_categories', 'recurring_rules', 'transactions', 'budgets', 'trades', 'price_cache',
    'fx_rates', 'portfolio_snapshots', 'vault_sections', 'vault_items'
  ];
  target text;
  position_in_order integer;
  table_rows jsonb;
  shared_columns text;
begin
  if owner_id is null then
    raise exception 'A restore needs an owner';
  end if;

  for position_in_order in reverse array_length(restore_order, 1)..1 loop
    execute format('delete from public.%I where user_id = $1', restore_order[position_in_order]) using owner_id;
  end loop;

  foreach target in array restore_order loop
    table_rows := backup -> 'tables' -> target;
    if table_rows is null or jsonb_typeof(table_rows) <> 'array' or jsonb_array_length(table_rows) = 0 then
      continue;
    end if;

    -- Only columns both the table and the file have. An older backup's missing columns take their defaults,
    -- and the owner column always comes from the signed-in owner, never from the file.
    select string_agg(quote_ident(c.column_name::text), ', ')
      into shared_columns
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name::text = target
       and c.column_name::text <> 'user_id'
       and (table_rows -> 0) ? c.column_name::text;

    if shared_columns is null then
      raise exception 'Backup rows for % match no columns', target;
    end if;

    execute format(
      'insert into public.%1$I (user_id, %2$s) select $1, %2$s from jsonb_populate_recordset(null::public.%1$I, $2)',
      target, shared_columns
    ) using owner_id, table_rows;
  end loop;
end;
$$;

revoke execute on function public.restore_backup(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_backup(uuid, jsonb) to service_role;
