import {
  BASE_CURRENCY,
  DEFAULT_CATEGORIES,
  DIVIDEND_CATEGORY_KEY,
  FOREIGN_CURRENCIES,
  MARKET_CURRENCY,
  SNAPSHOT_HISTORY_DAYS,
  type Currency,
  type Market,
} from "@/config/finance.config";
import { addDays } from "@/features/schedule/logic";
import type { ScheduleContext } from "@/features/schedule/generation";
import type { ActionResult, ScheduleErrorCode } from "@/features/schedule/types";
import {
  allocationByHolding,
  allocationByMarket,
  budgetAlerts,
  budgetStatuses,
  buildTrend,
  computeHoldings,
  dueOccurrences,
  firstOccurrenceOnOrAfter,
  monthRange,
  periodRange,
  portfolioTotals,
  priceIsStale,
  sumMoney,
  summarize,
  toTwd,
  totalsByCategory,
  valueHoldings,
} from "./logic";
import type { MarketData, Quote } from "./market-data";
import type { NewFinCategory, NewRecurringRule } from "./repo";
import type {
  FetchedPrice,
  FinanceView,
  FinCategory,
  FxRate,
  NewTrade,
  NewTransaction,
  RecurringFields,
  Trade,
  TradeFields,
  TransactionFields,
  TransactionKind,
} from "./types";

const OK: ActionResult = { ok: true };
const fail = (code: ScheduleErrorCode): ActionResult => ({ ok: false, code });

/* Setup */

export function defaultCategories(): NewFinCategory[] {
  const rows = (kind: TransactionKind, keys: readonly string[], offset: number) =>
    keys.map((key, index) => ({ kind, key, name: "", position: offset + index }));
  return [
    ...rows("expense", DEFAULT_CATEGORIES.expense, 0),
    ...rows("income", DEFAULT_CATEGORIES.income, DEFAULT_CATEGORIES.expense.length),
  ];
}

/** Creates the default categories the first time, and any repeating transactions now due. */
export async function ensureFinanceReady(ctx: ScheduleContext): Promise<void> {
  const categories = await ctx.repo.listFinCategories();
  if (categories.length === 0) await ctx.repo.insertFinCategories(defaultCategories());
  await generateDueRecurring(ctx);
}

/* Rates */

const rateFromList = (rates: FxRate[], currency: Currency): number | null =>
  currency === BASE_CURRENCY ? 1 : (rates.find((rate) => rate.currency === currency)?.rate ?? null);

/** A rate given by hand wins. Otherwise the latest one on or before the date, then the latest there is. */
async function resolveRate(
  ctx: ScheduleContext,
  currency: Currency,
  date: string,
  given: number | null
): Promise<number | null> {
  if (currency === BASE_CURRENCY) return 1;
  if (given !== null) return given;
  const onDate = rateFromList(await ctx.repo.listFxRatesOn(date), currency);
  return onDate ?? rateFromList(await ctx.repo.listFxRatesOn(ctx.today), currency);
}

/* Categories */

async function categoryOfKind(ctx: ScheduleContext, id: string, kind: TransactionKind): Promise<FinCategory | null> {
  const category = (await ctx.repo.listFinCategories()).find((row) => row.id === id);
  return category?.kind === kind ? category : null;
}

export async function createCategory(ctx: ScheduleContext, kind: TransactionKind, name: string): Promise<ActionResult> {
  const categories = await ctx.repo.listFinCategories();
  const position = Math.max(-1, ...categories.map((category) => category.position)) + 1;
  await ctx.repo.insertFinCategories([{ kind, key: null, name, position }]);
  return OK;
}

/** Archiving hides a category from new entries, while old records keep it. Its budget goes, as it can't be spent. */
export async function setCategoryArchived(ctx: ScheduleContext, id: string, archived: boolean): Promise<ActionResult> {
  await ctx.repo.updateFinCategory(id, { archived });
  if (archived) await ctx.repo.deleteBudget(id);
  return OK;
}

/* Transactions */

type TransactionInput = Omit<TransactionFields, "holding_market" | "holding_symbol"> & { fx_rate: number | null };

async function buildTransaction(ctx: ScheduleContext, input: TransactionInput): Promise<NewTransaction | ScheduleErrorCode> {
  if (!(await categoryOfKind(ctx, input.category_id, input.kind))) return "invalid";
  const fx_rate = await resolveRate(ctx, input.currency, input.date, input.fx_rate);
  if (fx_rate === null) return "fxMissing";
  return {
    ...input,
    fx_rate,
    amount_twd: toTwd(input.amount, input.currency, fx_rate),
    holding_market: null,
    holding_symbol: null,
    recurring_rule_id: null,
    recurring_date: null,
  };
}

export async function createTransaction(ctx: ScheduleContext, input: TransactionInput): Promise<ActionResult> {
  const built = await buildTransaction(ctx, input);
  if (typeof built === "string") return fail(built);
  await ctx.repo.createTransaction(built);
  return OK;
}

export async function updateTransaction(ctx: ScheduleContext, id: string, input: TransactionInput): Promise<ActionResult> {
  const existing = await ctx.repo.getTransaction(id);
  if (!existing) return fail("notFound");
  const built = await buildTransaction(ctx, input);
  if (typeof built === "string") return fail(built);
  // Editing keeps what the record is linked to.
  await ctx.repo.updateTransaction(id, {
    ...built,
    holding_market: existing.holding_market,
    holding_symbol: existing.holding_symbol,
    recurring_rule_id: existing.recurring_rule_id,
    recurring_date: existing.recurring_date,
  });
  return OK;
}

/* Recurring */

/** Creates every repeat now due. A foreign-currency rule with no rate at all waits, and catches up once there is one. */
export async function generateDueRecurring(ctx: ScheduleContext): Promise<number> {
  const rules = await ctx.repo.listRecurringRules();
  let created = 0;

  for (const rule of rules) {
    const { dates, nextDate } = dueOccurrences(rule, ctx.today);
    if (dates.length === 0) continue;

    const fx_rate = await resolveRate(ctx, rule.currency, ctx.today, null);
    if (fx_rate === null) continue;

    await ctx.repo.insertRecurringTransactions(
      dates.map((date) => ({
        kind: rule.kind,
        amount: rule.amount,
        currency: rule.currency,
        fx_rate,
        amount_twd: toTwd(rule.amount, rule.currency, fx_rate),
        date,
        category_id: rule.category_id,
        note: rule.note,
        payment_method: rule.payment_method,
        recurring_rule_id: rule.id,
        recurring_date: date,
        holding_market: null,
        holding_symbol: null,
      }))
    );
    await ctx.repo.updateRecurringRule(rule.id, { next_date: nextDate });
    created += dates.length;
  }
  return created;
}

export async function createRecurringRule(
  ctx: ScheduleContext,
  input: Omit<NewRecurringRule, "next_date" | "active">
): Promise<ActionResult> {
  if (!(await categoryOfKind(ctx, input.category_id, input.kind))) return fail("invalid");
  if (input.end_date !== null && input.end_date < input.start_date) return fail("invalid");
  await ctx.repo.createRecurringRule({ ...input, next_date: input.start_date, active: true });
  await generateDueRecurring(ctx);
  return OK;
}

export async function updateRecurringRule(
  ctx: ScheduleContext,
  id: string,
  input: Omit<RecurringFields, "active">
): Promise<ActionResult> {
  const rule = await ctx.repo.getRecurringRule(id);
  if (!rule) return fail("notFound");
  if (!(await categoryOfKind(ctx, input.category_id, input.kind))) return fail("invalid");
  if (input.end_date !== null && input.end_date < rule.start_date) return fail("invalid");
  await ctx.repo.updateRecurringRule(id, input);
  return OK;
}

/** Resuming skips what was missed while paused: pausing means you didn't want those. */
export async function setRecurringActive(ctx: ScheduleContext, id: string, active: boolean): Promise<ActionResult> {
  const rule = await ctx.repo.getRecurringRule(id);
  if (!rule) return fail("notFound");
  if (!active) {
    await ctx.repo.updateRecurringRule(id, { active });
    return OK;
  }
  const next_date = firstOccurrenceOnOrAfter(rule.start_date, rule.frequency, ctx.today);
  await ctx.repo.updateRecurringRule(id, { active, next_date: next_date > rule.next_date ? next_date : rule.next_date });
  await generateDueRecurring(ctx);
  return OK;
}

/* Budgets */

export async function setBudget(ctx: ScheduleContext, categoryId: string, amount: number): Promise<ActionResult> {
  if (!(await categoryOfKind(ctx, categoryId, "expense"))) return fail("invalid");
  await ctx.repo.setBudget(categoryId, amount);
  return OK;
}

/* Views */

export async function getFinanceOverview(ctx: ScheduleContext, view: FinanceView, date: string) {
  const { from, to } = periodRange(view, date);
  const [categories, transactions, rates] = await Promise.all([
    ctx.repo.listFinCategories(),
    ctx.repo.listTransactions(from, to),
    ctx.repo.listFxRatesOn(ctx.today),
  ]);
  return {
    categories,
    transactions,
    rates,
    from,
    to,
    summary: summarize(transactions),
    expenses: totalsByCategory(transactions, "expense"),
    income: totalsByCategory(transactions, "income"),
    trend: view === "day" ? null : buildTrend(view, date, transactions),
  };
}

async function monthStatuses(ctx: ScheduleContext) {
  const { from, to } = monthRange(ctx.today);
  const [budgets, transactions] = await Promise.all([ctx.repo.listBudgets(), ctx.repo.listTransactions(from, to)]);
  return { statuses: budgetStatuses(budgets, transactions), transactions };
}

export async function getBudgetsView(ctx: ScheduleContext) {
  const [categories, { statuses }] = await Promise.all([ctx.repo.listFinCategories(), monthStatuses(ctx)]);
  return { categories: categories.filter((category) => category.kind === "expense" && !category.archived), statuses };
}

/** This month's spending, and any budget at or past its alert line. Used by the banner and the Home widget. */
export async function getSpendingSummary(ctx: ScheduleContext) {
  const [categories, { statuses, transactions }] = await Promise.all([ctx.repo.listFinCategories(), monthStatuses(ctx)]);
  return { categories, summary: summarize(transactions), alerts: budgetAlerts(statuses) };
}

/* Portfolio */

const rateLookup = (rates: FxRate[]) => (currency: Currency) => rateFromList(rates, currency);

/** What moved the portfolio's value: open holdings only, as sold ones can't change. */
function openSymbols(trades: Trade[]) {
  return computeHoldings(trades).holdings.filter((holding) => holding.quantity > 0);
}

export async function getPortfolioView(ctx: ScheduleContext, data: MarketData) {
  const [trades, prices, rates, snapshots, dividends] = await Promise.all([
    ctx.repo.listTrades(),
    ctx.repo.listPrices(),
    ctx.repo.listFxRatesOn(ctx.today),
    ctx.repo.listPortfolioSnapshots(addDays(ctx.today, -SNAPSHOT_HISTORY_DAYS)),
    ctx.repo.listHoldingIncome(),
  ]);
  const { holdings } = computeHoldings(trades);
  const valued = valueHoldings(holdings, prices, rateLookup(rates));
  const now = ctx.now ?? new Date();

  const stale =
    hasStaleRates(rates, ctx.today) ||
    holdings.some((holding) => {
      if (holding.quantity === 0 || (holding.market === "US" && !data.hasUsSource)) return false;
      const row = prices.find((price) => price.market === holding.market && price.symbol === holding.symbol);
      return priceIsStale(row?.checked_at ?? null, holding.market, now);
    });

  return {
    trades: [...trades].reverse(),
    valued,
    rates,
    snapshots,
    stale,
    hasUsSource: data.hasUsSource,
    totals: portfolioTotals(valued),
    dividendsTwd: sumMoney(dividends.map((row) => row.amount_twd)),
    dividendsByHolding: Object.fromEntries(
      holdings.map((holding) => [
        `${holding.market}:${holding.symbol}`,
        sumMoney(
          dividends
            .filter((row) => row.holding_market === holding.market && row.holding_symbol === holding.symbol)
            .map((row) => row.amount_twd)
        ),
      ])
    ),
    byHolding: allocationByHolding(valued),
    byMarket: allocationByMarket(valued),
  };
}

export const hasStaleRates = (rates: FxRate[], today: string) =>
  FOREIGN_CURRENCIES.some((currency) => !rates.some((rate) => rate.currency === currency && rate.rate_date === today));

/** For the Home widget, which only reads what's stored and never waits on a price source. */
export async function getPortfolioSummary(ctx: ScheduleContext) {
  const [trades, prices, rates] = await Promise.all([
    ctx.repo.listTrades(),
    ctx.repo.listPrices(),
    ctx.repo.listFxRatesOn(ctx.today),
  ]);
  const valued = valueHoldings(computeHoldings(trades).holdings, prices, rateLookup(rates));
  return { hasTrades: trades.length > 0, totals: portfolioTotals(valued) };
}

/** Records today's value, so the history chart has a point for it. A later one the same day replaces it. */
export async function recordPortfolioSnapshot(ctx: ScheduleContext): Promise<void> {
  const { hasTrades, totals } = await getPortfolioSummary(ctx);
  // With nothing traded there's nothing to record, unless deleting the last trade just made today's point wrong.
  if (!hasTrades && (await ctx.repo.listPortfolioSnapshots(ctx.today)).length === 0) return;
  await ctx.repo.savePortfolioSnapshot({ date: ctx.today, value_twd: totals.value_twd, cost_twd: totals.cost_twd });
}

/** A trade's date decides what was held when, so any change must leave no sale of shares not yet owned. */
const wouldOversell = (trades: Trade[]) => computeHoldings(trades).oversold;

async function buildTrade(ctx: ScheduleContext, input: TradeFields & { fx_rate: number | null }): Promise<NewTrade | null> {
  const currency = MARKET_CURRENCY[input.market];
  const fx_rate = await resolveRate(ctx, currency, input.date, input.fx_rate);
  return fx_rate === null ? null : { ...input, currency, fx_rate };
}

export async function createTrade(ctx: ScheduleContext, input: TradeFields & { fx_rate: number | null }): Promise<ActionResult> {
  const trade = await buildTrade(ctx, input);
  if (!trade) return fail("fxMissing");
  const trades = await ctx.repo.listTrades();
  // Counted as entered last, as it will be once saved.
  const preview: Trade = { ...trade, id: "new", created_at: "9999-12-31T23:59:59.999Z" };
  if (wouldOversell([...trades, preview])) return fail("oversold");
  await ctx.repo.createTrade(trade);
  await recordPortfolioSnapshot(ctx);
  return OK;
}

export async function updateTrade(
  ctx: ScheduleContext,
  id: string,
  input: TradeFields & { fx_rate: number | null }
): Promise<ActionResult> {
  const trades = await ctx.repo.listTrades();
  const existing = trades.find((row) => row.id === id);
  if (!existing) return fail("notFound");
  const trade = await buildTrade(ctx, input);
  if (!trade) return fail("fxMissing");
  if (wouldOversell(trades.map((row) => (row.id === id ? { ...row, ...trade } : row)))) return fail("oversold");
  await ctx.repo.updateTrade(id, trade);
  await recordPortfolioSnapshot(ctx);
  return OK;
}

export async function deleteTrade(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  const trades = await ctx.repo.listTrades();
  if (wouldOversell(trades.filter((row) => row.id !== id))) return fail("oversold");
  await ctx.repo.deleteTrade(id);
  await recordPortfolioSnapshot(ctx);
  return OK;
}

/** A dividend is income in the holding's currency, linked to that holding. */
export async function recordDividend(
  ctx: ScheduleContext,
  input: { market: Market; symbol: string; amount: number; date: string; note: string }
): Promise<ActionResult> {
  const category = (await ctx.repo.listFinCategories()).find((row) => row.key === DIVIDEND_CATEGORY_KEY);
  if (!category) return fail("invalid");
  const currency = MARKET_CURRENCY[input.market];
  const fx_rate = await resolveRate(ctx, currency, input.date, null);
  if (fx_rate === null) return fail("fxMissing");
  await ctx.repo.createTransaction({
    kind: "income",
    amount: input.amount,
    currency,
    fx_rate,
    amount_twd: toTwd(input.amount, currency, fx_rate),
    date: input.date,
    category_id: category.id,
    note: input.note,
    payment_method: "",
    holding_market: input.market,
    holding_symbol: input.symbol,
    recurring_rule_id: null,
    recurring_date: null,
  });
  return OK;
}

export async function setManualPrice(
  ctx: ScheduleContext,
  input: { market: Market; symbol: string; price: number | null }
): Promise<ActionResult> {
  await ctx.repo.setManualPrice(input.market, input.symbol, MARKET_CURRENCY[input.market], input.price);
  await recordPortfolioSnapshot(ctx);
  return OK;
}

/* Fetching */

export type RefreshResult = { attempted: number; failed: number };

/**
 * Fetches today's exchange rates if they're missing, and any price past its freshness window. A source that fails
 * leaves the last known value in place. This runs after the page has shown, or from the daily job, so it never
 * slows a page down.
 */
export async function refreshMarketData(ctx: ScheduleContext, data: MarketData, force = false): Promise<RefreshResult> {
  const now = ctx.now ?? new Date();
  let attempted = 0;
  let failed = 0;

  if (hasStaleRates(await ctx.repo.listFxRatesOn(ctx.today), ctx.today)) {
    attempted++;
    const rates = await data.fxRates();
    if (rates) {
      await ctx.repo.saveFetchedFxRates(
        FOREIGN_CURRENCIES.map((currency) => ({ currency, rate_date: ctx.today, rate: rates[currency] }))
      );
    } else {
      failed++;
    }
  }

  const [trades, prices] = await Promise.all([ctx.repo.listTrades(), ctx.repo.listPrices()]);
  const due = openSymbols(trades).filter((holding) => {
    if (holding.market === "US" && !data.hasUsSource) return false;
    if (force) return true;
    const row = prices.find((price) => price.market === holding.market && price.symbol === holding.symbol);
    return priceIsStale(row?.checked_at ?? null, holding.market, now);
  });

  const usSymbols = due.filter((holding) => holding.market === "US").map((holding) => holding.symbol);
  const twSymbols = due.filter((holding) => holding.market === "TW").map((holding) => holding.symbol);
  const [usQuotes, twQuotes] = await Promise.all([
    Promise.all(usSymbols.map(async (symbol): Promise<[string, Quote | null]> => [symbol, await data.usQuote(symbol)])),
    data.twQuotes(twSymbols),
  ]);

  const checked_at = now.toISOString();
  const toRow = (market: Market, symbol: string, quote: Quote | null | undefined): FetchedPrice => ({
    market,
    symbol,
    currency: MARKET_CURRENCY[market],
    price: quote?.price ?? null,
    price_date: quote?.price_date ?? null,
    source: quote?.source ?? null,
    checked_at,
  });
  const rows = [
    ...usQuotes.map(([symbol, quote]) => toRow("US", symbol, quote)),
    ...twSymbols.map((symbol) => toRow("TW", symbol, twQuotes.get(symbol))),
  ];
  attempted += rows.length;
  failed += rows.filter((row) => row.price === null).length;
  await ctx.repo.savePrices(rows);

  await recordPortfolioSnapshot(ctx);
  return { attempted, failed };
}
