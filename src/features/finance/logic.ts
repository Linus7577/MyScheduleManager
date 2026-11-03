import {
  BASE_CURRENCY,
  BUDGET_LIMIT_PERCENT,
  BUDGET_WARNING_PERCENT,
  MARKET_CURRENCY,
  RECURRING_CATCH_UP_LIMIT,
  TW_PRICE_TTL_MINUTES,
  US_MARKET,
  US_PRICE_TTL_CLOSED_MINUTES,
  US_PRICE_TTL_OPEN_MINUTES,
  type Currency,
  type Market,
} from "@/config/finance.config";
import { addDays } from "@/features/schedule/logic";
import type {
  AllocationSlice,
  Budget,
  BudgetLevel,
  BudgetStatus,
  FinanceView,
  Holding,
  PortfolioTotals,
  PriceRow,
  RecurringFrequency,
  RecurringRule,
  Trade,
  Transaction,
  TransactionKind,
  ValuedHolding,
} from "./types";

const MONEY_SCALE = 100;
const QUANTITY_SCALE = 1_000_000;
const MS_PER_MINUTE = 60_000;

function roundTo(value: number, scale: number): number {
  const rounded = Math.round(Math.abs(value) * scale * (1 + Number.EPSILON)) / scale;
  return value < 0 ? -rounded : rounded;
}

/** Rounds to cents. Computers can't hold 0.1 exactly, so every money result passes through here. */
export const roundMoney = (value: number): number => roundTo(value, MONEY_SCALE);

const roundQuantity = (value: number): number => roundTo(value, QUANTITY_SCALE);

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}

/** The TWD value of an amount at the rate given. */
export function toTwd(amount: number, currency: Currency, rate: number): number {
  return currency === BASE_CURRENCY ? roundMoney(amount) : roundMoney(amount * rate);
}

/* Periods */

const parts = (date: string) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
  day: Number(date.slice(8, 10)),
});

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const pad = (value: number) => String(value).padStart(2, "0");

const isoDate = (year: number, month: number, day: number) => `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;

export function monthRange(date: string): { from: string; to: string } {
  const { year, month } = parts(date);
  return { from: isoDate(year, month, 1), to: isoDate(year, month, daysInMonth(year, month)) };
}

export function periodRange(view: FinanceView, date: string): { from: string; to: string } {
  if (view === "day") return { from: date, to: date };
  if (view === "month") return monthRange(date);
  const { year } = parts(date);
  return { from: isoDate(year, 1, 1), to: isoDate(year, 12, 31) };
}

/** A month's date keeps its day where it can: 31 January plus a month is 28 or 29 February. */
function addMonths(date: string, count: number): string {
  const { year, month, day } = parts(date);
  const index = year * 12 + (month - 1) + count;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index - targetYear * 12 + 1;
  return isoDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

export function shiftPeriod(view: FinanceView, date: string, delta: number): string {
  if (view === "day") return addDays(date, delta);
  return addMonths(date, view === "month" ? delta : delta * 12);
}

/* Summaries */

export type PeriodSummary = { income: number; expense: number; net: number };

export function summarize(transactions: Pick<Transaction, "kind" | "amount_twd">[]): PeriodSummary {
  const income = sumMoney(transactions.filter((row) => row.kind === "income").map((row) => row.amount_twd));
  const expense = sumMoney(transactions.filter((row) => row.kind === "expense").map((row) => row.amount_twd));
  return { income, expense, net: roundMoney(income - expense) };
}

export type CategoryTotal = { category_id: string; total: number; percent: number };

/** Largest first. Percentages are whole numbers of that kind's total. */
export function totalsByCategory(
  transactions: Pick<Transaction, "kind" | "amount_twd" | "category_id">[],
  kind: TransactionKind
): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const row of transactions) {
    if (row.kind === kind) totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + row.amount_twd);
  }
  const grand = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals.entries()]
    .map(([category_id, total]) => ({
      category_id,
      total: roundMoney(total),
      percent: grand > 0 ? Math.round((total / grand) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export type TrendPoint = { key: string; income: number; expense: number; net: number };

/** One point per day of the month, or per month of the year, including the empty ones. */
export function buildTrend(
  view: "month" | "year",
  date: string,
  transactions: Pick<Transaction, "kind" | "amount_twd" | "date">[]
): TrendPoint[] {
  const { year, month } = parts(date);
  const keys =
    view === "month"
      ? Array.from({ length: daysInMonth(year, month) }, (_, index) => isoDate(year, month, index + 1))
      : Array.from({ length: 12 }, (_, index) => `${String(year).padStart(4, "0")}-${pad(index + 1)}`);
  return keys.map((key) => ({ key, ...summarize(transactions.filter((row) => row.date.startsWith(key))) }));
}

/* Budgets */

function budgetLevel(percent: number): BudgetLevel {
  if (percent >= BUDGET_LIMIT_PERCENT) return "over";
  return percent >= BUDGET_WARNING_PERCENT ? "warning" : "ok";
}

export function budgetStatuses(
  budgets: Budget[],
  transactions: Pick<Transaction, "kind" | "amount_twd" | "category_id">[]
): BudgetStatus[] {
  return budgets.map((budget) => {
    const spent_twd = sumMoney(
      transactions
        .filter((row) => row.kind === "expense" && row.category_id === budget.category_id)
        .map((row) => row.amount_twd)
    );
    // Rounded down, so 79.9% doesn't raise the 80% alert. Whole cents first, so float noise can't lower a real 80%.
    const spentCents = Math.round(spent_twd * MONEY_SCALE);
    const budgetCents = Math.round(budget.amount_twd * MONEY_SCALE);
    const percent = budgetCents > 0 ? Math.floor((spentCents * 100) / budgetCents) : 0;
    return { category_id: budget.category_id, amount_twd: budget.amount_twd, spent_twd, percent, level: budgetLevel(percent) };
  });
}

/** Worst first. Budgets with no alert aren't included. */
export function budgetAlerts(statuses: BudgetStatus[]): BudgetStatus[] {
  return statuses.filter((status) => status.level !== "ok").sort((a, b) => b.percent - a.percent);
}

/* Recurring */

/** Counted from the start date each time, so a rule on the 31st goes back to the 31st after a short month. */
export function occurrenceDate(start: string, frequency: RecurringFrequency, index: number): string {
  if (frequency === "weekly") return addDays(start, index * 7);
  return addMonths(start, frequency === "monthly" ? index : index * 12);
}

/** The first repeat on or after a date. */
export function firstOccurrenceOnOrAfter(start: string, frequency: RecurringFrequency, date: string): string {
  if (start >= date) return start;
  const from = parts(start);
  const to = parts(date);
  const estimate =
    frequency === "weekly"
      ? Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / (7 * 86_400_000))
      : frequency === "monthly"
        ? (to.year - from.year) * 12 + (to.month - from.month) - 1
        : to.year - from.year - 1;
  for (let index = Math.max(0, estimate); ; index++) {
    const occurrence = occurrenceDate(start, frequency, index);
    if (occurrence >= date) return occurrence;
  }
}

/** Repeats now due and not created yet, plus the date the rule should wait for next. */
export function dueOccurrences(
  rule: Pick<RecurringRule, "start_date" | "frequency" | "next_date" | "end_date" | "active">,
  today: string,
  limit = RECURRING_CATCH_UP_LIMIT
): { dates: string[]; nextDate: string } {
  if (!rule.active) return { dates: [], nextDate: rule.next_date };

  const dates: string[] = [];
  let next = firstOccurrenceOnOrAfter(rule.start_date, rule.frequency, rule.next_date);
  while (next <= today && dates.length < limit && (rule.end_date === null || next <= rule.end_date)) {
    dates.push(next);
    next = firstOccurrenceOnOrAfter(rule.start_date, rule.frequency, addDays(next, 1));
  }
  return { dates, nextDate: next };
}

/* Portfolio */

const holdingKey = (market: Market, symbol: string) => `${market}:${symbol}`;

/** Oldest first. Trades on one day stay in the order they were entered. */
export function sortTrades<T extends Pick<Trade, "date" | "created_at">>(trades: T[]): T[] {
  return [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
}

/**
 * Replays every trade using the average-cost method.
 *
 * A buy adds to what's held, and its fee counts as part of the cost. A sell takes out shares at the average cost,
 * and the gap between that and what the sale brought in, after its fee, is the realized profit or loss. Selling
 * doesn't change the average cost of what's left. The TWD figures use each trade's own exchange rate, so a gain
 * from the currency moving is included.
 */
export function computeHoldings(trades: Trade[]): { holdings: Holding[]; oversold: boolean } {
  const held = new Map<string, Holding>();
  let oversold = false;

  for (const trade of sortTrades(trades)) {
    const key = holdingKey(trade.market, trade.symbol);
    const holding: Holding = held.get(key) ?? {
      market: trade.market,
      symbol: trade.symbol,
      currency: MARKET_CURRENCY[trade.market],
      quantity: 0,
      cost: 0,
      cost_twd: 0,
      average_cost: 0,
      realized: 0,
      realized_twd: 0,
    };
    held.set(key, holding);

    if (trade.side === "buy") {
      const spent = trade.quantity * trade.price + trade.fee;
      holding.quantity = roundQuantity(holding.quantity + trade.quantity);
      holding.cost += spent;
      holding.cost_twd += spent * trade.fx_rate;
    } else {
      if (trade.quantity > holding.quantity) {
        oversold = true;
        continue;
      }
      const share = holding.quantity > 0 ? trade.quantity / holding.quantity : 0;
      const costOut = holding.cost * share;
      const costOutTwd = holding.cost_twd * share;
      const proceeds = trade.quantity * trade.price - trade.fee;
      holding.realized += proceeds - costOut;
      holding.realized_twd += proceeds * trade.fx_rate - costOutTwd;
      holding.quantity = roundQuantity(holding.quantity - trade.quantity);
      holding.cost -= costOut;
      holding.cost_twd -= costOutTwd;
      if (holding.quantity === 0) {
        holding.cost = 0;
        holding.cost_twd = 0;
      }
    }
    holding.average_cost = holding.quantity > 0 ? holding.cost / holding.quantity : 0;
  }

  const holdings = [...held.values()].map((holding) => ({
    ...holding,
    cost: roundMoney(holding.cost),
    cost_twd: roundMoney(holding.cost_twd),
    average_cost: roundTo(holding.average_cost, QUANTITY_SCALE),
    realized: roundMoney(holding.realized),
    realized_twd: roundMoney(holding.realized_twd),
  }));
  return { holdings, oversold };
}

/** The price to use: one set by hand always wins. */
export function effectivePrice(row: PriceRow | undefined): Pick<ValuedHolding, "price" | "price_date" | "price_source"> {
  if (row?.manual_price != null) return { price: row.manual_price, price_date: null, price_source: "manual" };
  if (row?.price != null) return { price: row.price, price_date: row.price_date, price_source: row.source };
  return { price: null, price_date: null, price_source: null };
}

export function valueHoldings(
  holdings: Holding[],
  prices: PriceRow[],
  rateFor: (currency: Currency) => number | null
): ValuedHolding[] {
  return holdings.map((holding) => {
    const row = prices.find((price) => price.market === holding.market && price.symbol === holding.symbol);
    const chosen = effectivePrice(row);
    const rate = rateFor(holding.currency);

    if (chosen.price === null) {
      return { ...holding, ...chosen, market_value: null, market_value_twd: null, unrealized: null, unrealized_twd: null, unrealized_percent: null };
    }
    const market_value = roundMoney(holding.quantity * chosen.price);
    const market_value_twd = rate === null ? null : toTwd(market_value, holding.currency, rate);
    const unrealized = roundMoney(market_value - holding.cost);
    return {
      ...holding,
      ...chosen,
      market_value,
      market_value_twd,
      unrealized,
      unrealized_twd: market_value_twd === null ? null : roundMoney(market_value_twd - holding.cost_twd),
      unrealized_percent: holding.cost > 0 ? roundMoney((unrealized / holding.cost) * 100) : null,
    };
  });
}

export function portfolioTotals(valued: ValuedHolding[]): PortfolioTotals {
  const open = valued.filter((holding) => holding.quantity > 0);
  return {
    value_twd: sumMoney(open.map((holding) => holding.market_value_twd ?? holding.cost_twd)),
    cost_twd: sumMoney(open.map((holding) => holding.cost_twd)),
    unrealized_twd: sumMoney(open.map((holding) => holding.unrealized_twd ?? 0)),
    realized_twd: sumMoney(valued.map((holding) => holding.realized_twd)),
    unpriced: open.filter((holding) => holding.market_value_twd === null).length,
  };
}

function slices(entries: { key: string; label: string; value_twd: number }[]): AllocationSlice[] {
  const total = entries.reduce((sum, entry) => sum + entry.value_twd, 0);
  return entries
    .filter((entry) => entry.value_twd > 0)
    .map((entry) => ({ ...entry, percent: total > 0 ? Math.round((entry.value_twd / total) * 100) : 0 }))
    .sort((a, b) => b.value_twd - a.value_twd);
}

const openValue = (holding: ValuedHolding) => holding.market_value_twd ?? holding.cost_twd;

export function allocationByHolding(valued: ValuedHolding[]): AllocationSlice[] {
  return slices(
    valued
      .filter((holding) => holding.quantity > 0)
      .map((holding) => ({
        key: holdingKey(holding.market, holding.symbol),
        label: holding.symbol,
        value_twd: openValue(holding),
      }))
  );
}

export function allocationByMarket(valued: ValuedHolding[]): AllocationSlice[] {
  const open = valued.filter((holding) => holding.quantity > 0);
  const markets = [...new Set(open.map((holding) => holding.market))];
  return slices(
    markets.map((market) => ({
      key: market,
      label: market,
      value_twd: sumMoney(open.filter((holding) => holding.market === market).map(openValue)),
    }))
  );
}

/* Prices */

/** Whether New York is trading now. Weekends are known; market holidays aren't, which only means an extra look-up. */
export function isUsMarketOpen(now: Date): boolean {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: US_MARKET.timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (type: string) => formatted.find((item) => item.type === type)?.value ?? "";
  if (part("weekday") === "Sat" || part("weekday") === "Sun") return false;
  const time = `${part("hour")}:${part("minute")}`;
  return time >= US_MARKET.open && time < US_MARKET.close;
}

export function priceIsStale(checkedAt: string | null, market: Market, now: Date): boolean {
  if (checkedAt === null) return true;
  const ttl =
    market === "TW" ? TW_PRICE_TTL_MINUTES : isUsMarketOpen(now) ? US_PRICE_TTL_OPEN_MINUTES : US_PRICE_TTL_CLOSED_MINUTES;
  return now.getTime() - Date.parse(checkedAt) >= ttl * MS_PER_MINUTE;
}

/** Taiwan's sources write dates in the Minguo calendar: 1151102 is 2 November 2026. */
export function rocDateToIso(value: string): string | null {
  const match = /^(\d{3})(\d{2})(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
}
