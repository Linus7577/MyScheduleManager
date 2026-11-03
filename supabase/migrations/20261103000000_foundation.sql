-- Phase 0 foundation: shared helper, the first two tables, and the sign-up gate.
-- Every table in this project follows the pattern below. tests/db/rls.test.ts fails if one doesn't.

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- settings: one row per user. Normal pattern: read and write your own row only.
-- ---------------------------------------------------------------------------
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'zh-TW')),
  timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

alter table public.settings enable row level security;

-- RLS can't stop TRUNCATE, so table rights are cut back as well as adding policies.
revoke all on public.settings from anon, authenticated;
grant select, insert, update on public.settings to authenticated;

create policy settings_select_own on public.settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy settings_insert_own on public.settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy settings_update_own on public.settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- audit_log: append-only. Rows can be added and read, never changed or removed.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  actor text not null check (actor in ('owner', 'oracle', 'system')),
  action text not null,
  entity text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index audit_log_user_created_idx on public.audit_log (user_id, created_at desc);

alter table public.audit_log enable row level security;

revoke all on public.audit_log from anon, authenticated;
grant select, insert on public.audit_log to authenticated;

create policy audit_log_select_own on public.audit_log
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy audit_log_insert_own on public.audit_log
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Sign-up gate: Supabase asks this before creating any new account.
-- Without it, a stranger could sign in with Google directly against Supabase
-- using the public key. The email list lives outside the API-exposed schema.
-- ---------------------------------------------------------------------------
create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;

-- Exception to the user_id rule: this is read before any user exists.
create table private.signup_allowlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index signup_allowlist_email_idx on private.signup_allowlist (lower(email));

alter table private.signup_allowlist enable row level security;

revoke all on private.signup_allowlist from public, anon, authenticated;
grant select on private.signup_allowlist to supabase_auth_admin;

create policy signup_allowlist_read_by_auth on private.signup_allowlist
  for select to supabase_auth_admin
  using (true);

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  signup_email text := lower(trim(event -> 'user' ->> 'email'));
begin
  if exists (select 1 from private.signup_allowlist a where lower(a.email) = signup_email) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Access denied')
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;
