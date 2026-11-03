-- Phase 1: the loop. Weekly templates, the real blocks on real dates, rest days and one-off events.
-- Dates and times are the owner's local wall clock, so changing timezone never shifts a block.

create table public.loop_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The active template on any date is the one with the latest effective_from on or before that date.
create table public.template_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id uuid not null references public.loop_templates (id) on delete cascade,
  effective_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

create table public.template_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id uuid not null references public.loop_templates (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  category text not null check (category in ('project_work', 'study', 'gym', 'reading', 'useful_youtube', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time <> end_time)
);

create index template_blocks_template_idx on public.template_blocks (template_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  notes text not null default '',
  category text not null check (category in ('project_work', 'study', 'gym', 'reading', 'useful_youtube', 'other')),
  all_day boolean not null default false,
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (all_day = (start_time is null)),
  check (all_day = (end_time is null))
);

create index events_user_dates_idx on public.events (user_id, start_date, end_date);

create table public.block_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  category text not null check (category in ('project_work', 'study', 'gym', 'reading', 'useful_youtube', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  notes text not null default '',
  status text not null default 'planned' check (status in ('planned', 'done', 'partial', 'skipped', 'rest')),
  log_note text not null default '',
  logged_at timestamptz,
  template_block_id uuid references public.template_blocks (id) on delete set null,
  event_id uuid references public.events (id) on delete cascade,
  is_edited boolean not null default false,
  is_cancelled boolean not null default false,
  focus_broken_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time <> end_time),
  unique (user_id, template_block_id, date),
  unique (user_id, event_id)
);

create index block_instances_user_date_idx on public.block_instances (user_id, date);

create table public.rest_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('rest', 'shield')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- The same pattern on every table: updated_at, RLS, least-privilege rights, own rows only.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'loop_templates', 'template_activations', 'template_blocks', 'events', 'block_instances', 'rest_days'
  ]
  loop
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
