-- Phase 6: the Vault. A hub of links and notes pointing to where files already live. No files are stored here.

create table public.vault_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- A default section has a key, and shows its translated name until it's given a name of its own.
  key text check (char_length(key) between 1 and 40),
  name text not null default '' check (char_length(name) <= 40),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (key is not null or char_length(name) >= 1),
  unique (user_id, key)
);

create table public.vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('link', 'note', 'file')),
  title text not null check (char_length(title) between 1 and 200),
  -- A section with items can't be deleted, so no item is ever left without one.
  section_id uuid not null references public.vault_sections (id) on delete restrict,
  description text not null default '' check (char_length(description) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  url text check (char_length(url) <= 2000),
  body text not null default '' check (char_length(body) <= 20000),
  -- Removing what an item is linked to keeps the item, without the link.
  goal_id uuid references public.goals (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  track_id uuid references public.learning_tracks (id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A note has no address. A link or file reference must have one, and only ever a web address.
  check ((type = 'note' and url is null) or (type <> 'note' and url is not null and url ~* '^https?://')),
  check (num_nonnulls(goal_id, project_id, track_id) <= 1)
);

create index vault_items_section_idx on public.vault_items (section_id);
create index vault_items_goal_idx on public.vault_items (goal_id) where goal_id is not null;
create index vault_items_project_idx on public.vault_items (project_id) where project_id is not null;
create index vault_items_track_idx on public.vault_items (track_id) where track_id is not null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['vault_sections', 'vault_items'] loop
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
