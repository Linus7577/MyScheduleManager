-- Phase 5: the Treasury. Categories, transactions, repeating transactions and budgets; trades, cached prices,
-- exchange rates and daily portfolio snapshots. Totals are always worked out from these rows, never stored.

create table public.fin_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  -- A default category has a key, and shows its translated name until it's given a name of its own.
  key text check (char_length(key) between 1 and 40),
  name text not null default '' check (char_length(name) <= 40),
  position integer not null default 0,
  -- Archived rather than deleted, so old records keep their category.
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (key is not null or char_length(name) >= 1),
  unique (user_id, key)
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null check (currency in ('TWD', 'USD', 'IDR')),
  category_id uuid not null references public.fin_categories (id) on delete restrict,
  note text not null default '' check (char_length(note) <= 500),
  payment_method text not null default '' check (char_length(payment_method) <= 40),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  start_date date not null,
  next_date date not null,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurring_rules_category_idx on public.recurring_rules (category_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null check (currency in ('TWD', 'USD', 'IDR')),
  -- What one unit of the currency was worth in TWD at the time, and the result. Later rate changes don't touch these.
  fx_rate numeric(24, 12) not null check (fx_rate > 0),
  amount_twd numeric(18, 2) not null check (amount_twd >= 0),
  date date not null,
  category_id uuid not null references public.fin_categories (id) on delete restrict,
  note text not null default '' check (char_length(note) <= 500),
  payment_method text not null default '' check (char_length(payment_method) <= 40),
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  recurring_date date,
  -- A dividend names the holding it came from.
  holding_market text check (holding_market in ('US', 'TW')),
  holding_symbol text check (char_length(holding_symbol) between 1 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (currency <> 'TWD' or fx_rate = 1),
  check ((holding_market is null) = (holding_symbol is null)),
  -- The same repeat can never be created twice.
  unique (recurring_rule_id, recurring_date)
);

create index transactions_date_idx on public.transactions (user_id, date);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_holding_idx on public.transactions (user_id, holding_market, holding_symbol)
  where holding_symbol is not null;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.fin_categories (id) on delete cascade,
  amount_twd numeric(18, 2) not null check (amount_twd > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id)
);

create index budgets_category_idx on public.budgets (category_id);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  market text not null check (market in ('US', 'TW')),
  symbol text not null check (char_length(symbol) between 1 and 16),
  quantity numeric(20, 6) not null check (quantity > 0),
  price numeric(18, 6) not null check (price >= 0),
  fee numeric(18, 2) not null default 0 check (fee >= 0),
  currency text not null check (currency in ('TWD', 'USD', 'IDR')),
  fx_rate numeric(24, 12) not null check (fx_rate > 0),
  date date not null,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trades_date_idx on public.trades (user_id, date);

create table public.price_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  market text not null check (market in ('US', 'TW')),
  symbol text not null check (char_length(symbol) between 1 and 16),
  currency text not null check (currency in ('TWD', 'USD', 'IDR')),
  price numeric(18, 6) check (price >= 0),
  price_date date,
  source text check (source in ('finnhub', 'twse', 'tpex')),
  checked_at timestamptz,
  manual_price numeric(18, 6) check (manual_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, market, symbol)
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  currency text not null check (currency in ('USD', 'IDR')),
  rate_date date not null,
  rate numeric(24, 12) not null check (rate > 0),
  source text not null check (source in ('api', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, currency, rate_date)
);

create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  value_twd numeric(18, 2) not null,
  cost_twd numeric(18, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'fin_categories',
    'recurring_rules',
    'transactions',
    'budgets',
    'trades',
    'price_cache',
    'fx_rates',
    'portfolio_snapshots'
  ] loop
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
