-- Phase 3: the command center. Goals, projects and tasks; the learning tracker; habits; progress snapshots
-- for charts; and the saved dashboard layout.

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  why text not null default '',
  target_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  progress_mode text not null default 'tasks' check (progress_mode in ('tasks', 'manual')),
  manual_percent smallint not null default 0 check (manual_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_goal_idx on public.projects (goal_id);

create table public.learning_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('course', 'roadmap', 'book')),
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track_id uuid not null references public.learning_tracks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  position integer not null default 0,
  percent smallint not null default 0 check (percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_units_track_idx on public.learning_units (track_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  estimate_minutes integer check (estimate_minutes between 1 and 100000),
  category text not null default 'other'
    check (category in ('project_work', 'study', 'gym', 'reading', 'useful_youtube', 'other')),
  track_id uuid references public.learning_tracks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_project_idx on public.tasks (project_id);
create index tasks_user_due_idx on public.tasks (user_id, due_date);

create table public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  entity_type text not null check (entity_type in ('goal', 'project', 'track')),
  entity_id uuid not null,
  percent smallint not null check (percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, entity_type, entity_id)
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  target_per_week smallint not null default 7 check (target_per_week between 1 and 7),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habit_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, habit_id, date)
);

create index habit_checkins_user_date_idx on public.habit_checkins (user_id, date);

create table public.widget_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device text not null check (device in ('mobile', 'desktop')),
  layout jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device)
);

alter table public.template_blocks
  add column track_id uuid references public.learning_tracks (id) on delete set null;
alter table public.block_instances
  add column track_id uuid references public.learning_tracks (id) on delete set null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'goals', 'projects', 'learning_tracks', 'learning_units', 'tasks', 'progress_snapshots',
    'habits', 'habit_checkins', 'widget_layouts'
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
