-- Phase 4: the Oracle. Conversations, proposals awaiting approval, undoable actions, the daily suggestion,
-- the rate limit, and weekly reviews. The model never touches any of this directly: only the server's typed tools do.

alter table public.settings
  add column about_me text not null default '' check (char_length(about_me) <= 2000);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  kind text not null check (kind in ('block_changes', 'template_changes')),
  summary text not null,
  changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_proposals_conversation_idx on public.ai_proposals (conversation_id, created_at);

create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  tool text not null,
  summary text not null,
  undo jsonb not null,
  undo_until timestamptz not null,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_actions_conversation_idx on public.ai_actions (conversation_id, created_at);

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  text text not null,
  generation_count smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.ai_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  oracle_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_conversations', 'ai_messages', 'ai_proposals', 'ai_actions', 'ai_suggestions', 'ai_rate_limits', 'weekly_reviews'
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

-- Counts this request in the current minute, and says whether it's within the limit. A single statement, so two
-- requests arriving together can't both slip through.
create function public.bump_ai_rate_limit(owner_id uuid, max_per_minute integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  within_limit boolean;
begin
  insert into public.ai_rate_limits as existing (user_id, window_start, count)
  values (owner_id, date_trunc('minute', now()), 1)
  on conflict (user_id) do update
    set count = case when existing.window_start = excluded.window_start then existing.count + 1 else 1 end,
        window_start = excluded.window_start
  returning count <= max_per_minute into within_limit;
  return within_limit;
end;
$$;

revoke execute on function public.bump_ai_rate_limit(uuid, integer) from public, anon;
grant execute on function public.bump_ai_rate_limit(uuid, integer) to authenticated, service_role;
