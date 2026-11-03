-- Phase 2: the game. The ledger is the truth, game_state is a fast copy of it, and closed_days makes closeout
-- safe to run twice. All changes go through apply_game_commit, so a change lands whole or not at all.

alter table public.settings
  add column motion text not null default 'full' check (motion in ('full', 'reduced', 'off'));

create table public.game_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  power numeric(7, 3) not null default 100 check (power between 0 and 100),
  tier smallint not null default 1 check (tier between 1 and 8),
  streak_days integer not null default 0 check (streak_days >= 0),
  power_zero_count smallint not null default 0,
  demotion_count smallint not null default 0,
  last_closed_date date,
  seen_level integer not null default 1,
  seen_tier smallint not null default 1,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only: a mistake is fixed by adding a reversing row, never by editing history.
create table public.game_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  source text not null check (source in ('block', 'closeout', 'correction', 'collapse')),
  block_instance_id uuid references public.block_instances (id) on delete set null,
  block_title text not null default '',
  reason text not null,
  delta_xp integer not null default 0,
  delta_power numeric(7, 3) not null default 0,
  tier smallint not null check (tier between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index game_ledger_user_created_idx on public.game_ledger (user_id, created_at desc);
create index game_ledger_block_idx on public.game_ledger (block_instance_id);

create table public.closed_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  day_type text not null check (day_type in ('normal', 'rest', 'shield', 'empty')),
  planned_minutes integer not null default 0,
  done_minutes integer not null default 0,
  partial_minutes integer not null default 0,
  skipped_minutes integer not null default 0,
  blocks_skipped integer not null default 0,
  xp_gained integer not null default 0,
  xp_lost integer not null default 0,
  power_change numeric(7, 3) not null default 0,
  counted boolean,
  streak_before integer not null default 0,
  streak_after integer not null default 0,
  tier_before smallint not null default 1,
  tier_after smallint not null default 1,
  collapsed boolean not null default false,
  demoted boolean not null default false,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['game_state', 'game_ledger', 'closed_days', 'daily_summaries']
  loop
    execute format(
      'create trigger %1$I before update on public.%2$I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format(
      'create policy %1$I on public.%2$I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name || '_select_own', table_name
    );
    execute format(
      'create policy %1$I on public.%2$I for insert to authenticated with check ((select auth.uid()) = user_id)',
      table_name || '_insert_own', table_name
    );
  end loop;
end;
$$;

-- The ledger and closed days can only be read and added to.
grant select, insert on public.game_ledger to authenticated;
grant select, insert on public.closed_days to authenticated;

-- The state and summaries change over time.
grant select, insert, update on public.game_state to authenticated;
grant select, insert, update on public.daily_summaries to authenticated;

create policy game_state_update_own on public.game_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy daily_summaries_update_own on public.daily_summaries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Runs as the caller, so every rule above still applies. The whole function is one transaction.
create function public.apply_game_commit(owner_id uuid, commit_data jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  close_date date := (commit_data ->> 'close_date')::date;
  new_state jsonb := commit_data -> 'state';
begin
  update public.game_state
  set total_xp = (new_state ->> 'total_xp')::integer,
      power = (new_state ->> 'power')::numeric,
      tier = (new_state ->> 'tier')::smallint,
      streak_days = (new_state ->> 'streak_days')::integer,
      power_zero_count = (new_state ->> 'power_zero_count')::smallint,
      demotion_count = (new_state ->> 'demotion_count')::smallint,
      last_closed_date = (new_state ->> 'last_closed_date')::date,
      version = version + 1
  where user_id = owner_id
    and version = (commit_data ->> 'expected_version')::integer;
  if not found then
    return false;
  end if;

  if close_date is not null then
    insert into public.closed_days (user_id, date)
    values (owner_id, close_date)
    on conflict (user_id, date) do nothing;
    if not found then
      -- Already closed. Raising undoes the state change above.
      raise exception 'day already closed' using errcode = 'P0001';
    end if;
  end if;

  update public.block_instances target
  set status = change.status,
      log_note = change.log_note,
      logged_at = change.logged_at
  from jsonb_to_recordset(coalesce(commit_data -> 'instances', '[]'::jsonb))
    as change (id uuid, status text, log_note text, logged_at timestamptz)
  where target.id = change.id and target.user_id = owner_id;

  insert into public.game_ledger
    (user_id, date, source, block_instance_id, block_title, reason, delta_xp, delta_power, tier)
  select owner_id, entry.date, entry.source, entry.block_instance_id, entry.block_title, entry.reason,
         entry.delta_xp, entry.delta_power, entry.tier
  from jsonb_to_recordset(coalesce(commit_data -> 'ledger', '[]'::jsonb))
    as entry (date date, source text, block_instance_id uuid, block_title text, reason text,
              delta_xp integer, delta_power numeric, tier smallint);

  insert into public.daily_summaries
    (user_id, date, day_type, planned_minutes, done_minutes, partial_minutes, skipped_minutes, blocks_skipped,
     xp_gained, xp_lost, power_change, counted, streak_before, streak_after, tier_before, tier_after,
     collapsed, demoted, seen_at)
  select owner_id, summary.date, summary.day_type, summary.planned_minutes, summary.done_minutes,
         summary.partial_minutes, summary.skipped_minutes, summary.blocks_skipped, summary.xp_gained,
         summary.xp_lost, summary.power_change, summary.counted, summary.streak_before, summary.streak_after,
         summary.tier_before, summary.tier_after, summary.collapsed, summary.demoted, summary.seen_at
  from jsonb_to_recordset(coalesce(commit_data -> 'summaries', '[]'::jsonb))
    as summary (date date, day_type text, planned_minutes integer, done_minutes integer, partial_minutes integer,
                skipped_minutes integer, blocks_skipped integer, xp_gained integer, xp_lost integer,
                power_change numeric, counted boolean, streak_before integer, streak_after integer,
                tier_before smallint, tier_after smallint, collapsed boolean, demoted boolean, seen_at timestamptz)
  on conflict (user_id, date) do update
    set planned_minutes = excluded.planned_minutes,
        done_minutes = excluded.done_minutes,
        partial_minutes = excluded.partial_minutes,
        skipped_minutes = excluded.skipped_minutes,
        blocks_skipped = excluded.blocks_skipped,
        xp_gained = excluded.xp_gained,
        xp_lost = excluded.xp_lost,
        power_change = excluded.power_change,
        counted = excluded.counted,
        streak_before = excluded.streak_before,
        streak_after = excluded.streak_after;

  insert into public.audit_log (user_id, actor, action, entity, details)
  select owner_id, entry.actor, entry.action, entry.entity, coalesce(entry.details, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(commit_data -> 'audit', '[]'::jsonb))
    as entry (actor text, action text, entity text, details jsonb);

  return true;
exception
  when sqlstate 'P0001' then
    return false;
end;
$$;

revoke execute on function public.apply_game_commit(uuid, jsonb) from public, anon;
grant execute on function public.apply_game_commit(uuid, jsonb) to authenticated, service_role;
