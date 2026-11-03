import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketData } from "@/features/finance/market-data";
import { parseFinnhubQuote, parseFxRates, parseTpexDaily, parseTwseDaily } from "@/features/finance/market-data";
import {
  createCategory,
  createRecurringRule,
  createTrade,
  createTransaction,
  defaultCategories,
  deleteTrade,
  ensureFinanceReady,
  generateDueRecurring,
  getBudgetsView,
  getFinanceOverview,
  getPortfolioView,
  getSpendingSummary,
  recordDividend,
  refreshMarketData,
  setBudget,
  setCategoryArchived,
  setManualPrice,
  setRecurringActive,
  updateTrade,
  updateTransaction,
} from "@/features/finance/service";
import type { ScheduleContext } from "@/features/schedule/generation";
import { createMemoryRepo } from "@/features/schedule/memory-repo";

const TODAY = "2026-11-03";

function market(patch: Partial<MarketData> = {}): MarketData {
  return {
    hasUsSource: true,
    usQuote: vi.fn(async () => ({ price: 150, price_date: "2026-11-02", source: "finnhub" as const })),
    twQuotes: vi.fn(async (symbols: string[]) => new Map(symbols.map((symbol) => [symbol, { price: 1000, price_date: "2026-11-02", source: "twse" as const }]))),
    fxRates: vi.fn(async () => ({ USD: 32, IDR: 0.002 })),
    ...patch,
  };
}

let ctx: ScheduleContext;

async function category(kind: "expense" | "income", key: string): Promise<string> {
  const found = (await ctx.repo.listFinCategories()).find((row) => row.kind === kind && row.key === key);
  if (!found) throw new Error(`No category ${key}`);
  return found.id;
}

const spend = async (amount: number, patch: Partial<Parameters<typeof createTransaction>[1]> = {}) =>
  createTransaction(ctx, {
    kind: "expense",
    amount,
    currency: "TWD",
    date: TODAY,
    category_id: await category("expense", "food"),
    note: "",
    payment_method: "",
    fx_rate: null,
    ...patch,
  });

const buy = (patch: Partial<Parameters<typeof createTrade>[1]> = {}) =>
  createTrade(ctx, {
    side: "buy",
    market: "US",
    symbol: "AAPL",
    quantity: 10,
    price: 100,
    fee: 0,
    date: TODAY,
    note: "",
    fx_rate: 30,
    ...patch,
  });

beforeEach(async () => {
  ctx = { repo: createMemoryRepo(), today: TODAY, now: new Date("2026-11-03T03:00:00Z") };
  await ensureFinanceReady(ctx);
});

describe("default categories", () => {
  it("has every category the spec lists", () => {
    const rows = defaultCategories();
    expect(rows.filter((row) => row.kind === "expense")).toHaveLength(12);
    expect(rows.filter((row) => row.kind === "income")).toHaveLength(5);
  });

  it("are created once, however many times the page loads", async () => {
    await ensureFinanceReady(ctx);
    expect(await ctx.repo.listFinCategories()).toHaveLength(17);
  });

  it("can be added to and archived, and archiving removes the budget", async () => {
    await createCategory(ctx, "expense", "Pets");
    expect((await ctx.repo.listFinCategories()).at(-1)).toMatchObject({ name: "Pets", key: null });

    const food = await category("expense", "food");
    await setBudget(ctx, food, 100);
    await setCategoryArchived(ctx, food, true);
    expect(await ctx.repo.listBudgets()).toEqual([]);
    expect((await getBudgetsView(ctx)).categories.some((row) => row.id === food)).toBe(false);
  });

  it("finds a renamed default category for dividends", async () => {
    const id = await category("income", "investmentIncome");
    await ctx.repo.updateFinCategory(id, { name: "Stocks" });
    await ctx.repo.setManualFxRate("USD", TODAY, 32);
    await buy();
    expect(await recordDividend(ctx, { market: "US", symbol: "AAPL", amount: 5, date: TODAY, note: "" })).toEqual({ ok: true });
    expect((await ctx.repo.listHoldingIncome())[0].category_id).toBe(id);
  });
});

describe("transactions", () => {
  it("stores the original amount, the rate and the TWD amount", async () => {
    await ctx.repo.setManualFxRate("USD", TODAY, 32.5);
    await spend(10, { currency: "USD" });
    expect((await ctx.repo.listTransactions(TODAY, TODAY))[0]).toMatchObject({ amount: 10, currency: "USD", fx_rate: 32.5, amount_twd: 325 });
  });

  it("uses TWD as it is", async () => {
    await spend(100.5);
    expect((await ctx.repo.listTransactions(TODAY, TODAY))[0]).toMatchObject({ fx_rate: 1, amount_twd: 100.5 });
  });

  it("refuses foreign money with no rate, and takes one given by hand", async () => {
    expect(await spend(10, { currency: "IDR" })).toEqual({ ok: false, code: "fxMissing" });
    expect(await spend(10_000, { currency: "IDR", fx_rate: 0.002 })).toEqual({ ok: true });
    expect((await ctx.repo.listTransactions(TODAY, TODAY))[0].amount_twd).toBe(20);
  });

  it("uses the rate from the date of a back-dated record, when there is one", async () => {
    await ctx.repo.setManualFxRate("USD", "2026-10-01", 30);
    await ctx.repo.setManualFxRate("USD", TODAY, 33);
    await spend(1, { currency: "USD", date: "2026-10-15" });
    expect((await ctx.repo.listTransactions("2026-10-15", "2026-10-15"))[0].fx_rate).toBe(30);
  });

  it("falls back to the latest rate when none is that old", async () => {
    await ctx.repo.setManualFxRate("USD", TODAY, 33);
    await spend(1, { currency: "USD", date: "2020-01-01" });
    expect((await ctx.repo.listTransactions("2020-01-01", "2020-01-01"))[0].fx_rate).toBe(33);
  });

  it("refuses a category of the wrong kind", async () => {
    expect(await spend(1, { category_id: await category("income", "allowance") })).toEqual({ ok: false, code: "invalid" });
  });

  it("a later rate doesn't change old records", async () => {
    await ctx.repo.setManualFxRate("USD", TODAY, 32);
    await spend(10, { currency: "USD" });
    await ctx.repo.setManualFxRate("USD", TODAY, 99);
    expect((await ctx.repo.listTransactions(TODAY, TODAY))[0].amount_twd).toBe(320);
  });

  it("editing recalculates, and keeps what the record is linked to", async () => {
    await ctx.repo.setManualFxRate("USD", TODAY, 32);
    await buy();
    await recordDividend(ctx, { market: "US", symbol: "AAPL", amount: 5, date: TODAY, note: "" });
    const [row] = await ctx.repo.listTransactions(TODAY, TODAY);
    await updateTransaction(ctx, row.id, {
      kind: "income",
      amount: 6,
      currency: "USD",
      date: TODAY,
      category_id: row.category_id,
      note: "",
      payment_method: "",
      fx_rate: 31,
    });
    expect((await ctx.repo.listTransactions(TODAY, TODAY))[0]).toMatchObject({ amount_twd: 186, holding_symbol: "AAPL" });
  });

  it("reports a missing record", async () => {
    expect(await updateTransaction(ctx, "nope", { kind: "expense", amount: 1, currency: "TWD", date: TODAY, category_id: "x", note: "", payment_method: "", fx_rate: null })).toEqual({ ok: false, code: "notFound" });
  });
});

describe("views", () => {
  beforeEach(async () => {
    await spend(100);
    await spend(50, { date: "2026-11-01" });
    await spend(25, { date: "2026-10-31" });
    await createTransaction(ctx, { kind: "income", amount: 1000, currency: "TWD", date: TODAY, category_id: await category("income", "allowance"), note: "", payment_method: "", fx_rate: null });
  });

  it("shows a day", async () => {
    const view = await getFinanceOverview(ctx, "day", TODAY);
    expect(view.summary).toEqual({ income: 1000, expense: 100, net: 900 });
    expect(view.trend).toBeNull();
    expect(view.transactions).toHaveLength(2);
  });

  it("shows a month, not spilling across its edges", async () => {
    const view = await getFinanceOverview(ctx, "month", TODAY);
    expect(view.summary.expense).toBe(150);
    expect(view.trend).toHaveLength(30);
    expect(view.expenses).toEqual([{ category_id: await category("expense", "food"), total: 150, percent: 100 }]);
  });

  it("shows a year", async () => {
    const view = await getFinanceOverview(ctx, "year", TODAY);
    expect(view.summary).toEqual({ income: 1000, expense: 175, net: 825 });
    expect(view.trend).toHaveLength(12);
  });
});

describe("budget alerts", () => {
  it("raises nothing below 80%, warns at 80%, and marks 100%", async () => {
    await setBudget(ctx, await category("expense", "food"), 1000);
    await spend(799);
    expect((await getSpendingSummary(ctx)).alerts).toEqual([]);
    await spend(1);
    expect((await getSpendingSummary(ctx)).alerts[0]).toMatchObject({ level: "warning", percent: 80 });
    await spend(200);
    expect((await getSpendingSummary(ctx)).alerts[0]).toMatchObject({ level: "over", percent: 100 });
  });

  it("only counts this month", async () => {
    await setBudget(ctx, await category("expense", "food"), 100);
    await spend(500, { date: "2026-10-31" });
    expect((await getSpendingSummary(ctx)).alerts).toEqual([]);
  });

  it("counts foreign spending at its TWD value", async () => {
    await setBudget(ctx, await category("expense", "food"), 100);
    await spend(3, { currency: "USD", fx_rate: 30 });
    expect((await getSpendingSummary(ctx)).alerts[0]).toMatchObject({ level: "warning", percent: 90, spent_twd: 90 });
  });

  it("only applies to expense categories", async () => {
    expect(await setBudget(ctx, await category("income", "allowance"), 100)).toEqual({ ok: false, code: "invalid" });
  });
});

describe("recurring", () => {
  const rule = async (patch: Partial<Parameters<typeof createRecurringRule>[1]> = {}) =>
    createRecurringRule(ctx, {
      kind: "expense",
      amount: 5000,
      currency: "TWD",
      category_id: await category("expense", "housing"),
      note: "Rent",
      payment_method: "",
      end_date: null,
      frequency: "monthly",
      start_date: "2026-09-01",
      ...patch,
    });

  it("creates what's due straight away, including the past", async () => {
    await rule();
    const rows = await ctx.repo.listTransactions("2026-01-01", "2026-12-31");
    expect(rows.map((row) => row.date)).toEqual(["2026-11-01", "2026-10-01", "2026-09-01"]);
    expect(rows[0]).toMatchObject({ amount_twd: 5000, note: "Rent", recurring_date: "2026-11-01" });
    expect((await ctx.repo.listRecurringRules())[0].next_date).toBe("2026-12-01");
  });

  it("never creates the same one twice", async () => {
    await rule();
    await generateDueRecurring(ctx);
    await ensureFinanceReady(ctx);
    expect(await ctx.repo.listTransactions("2026-01-01", "2026-12-31")).toHaveLength(3);
  });

  it("doesn't bring back a repeat you deleted", async () => {
    await rule();
    const [row] = await ctx.repo.listTransactions("2026-11-01", "2026-11-01");
    await ctx.repo.deleteTransaction(row.id);
    await generateDueRecurring(ctx);
    expect(await ctx.repo.listTransactions("2026-11-01", "2026-11-01")).toEqual([]);
  });

  it("creates the next one when its day comes", async () => {
    await rule();
    await generateDueRecurring({ ...ctx, today: "2026-11-30" });
    expect(await ctx.repo.listTransactions("2026-12-01", "2026-12-01")).toEqual([]);
    await generateDueRecurring({ ...ctx, today: "2026-12-01" });
    expect(await ctx.repo.listTransactions("2026-12-01", "2026-12-01")).toHaveLength(1);
  });

  it("converts foreign amounts, and waits while there's no rate at all", async () => {
    await rule({ currency: "USD", amount: 10, start_date: TODAY });
    expect(await ctx.repo.listTransactions(TODAY, TODAY)).toEqual([]);
    await ctx.repo.setManualFxRate("USD", TODAY, 32);
    await generateDueRecurring(ctx);
    expect((await ctx.repo.listTransactions(TODAY, TODAY))[0]).toMatchObject({ amount: 10, amount_twd: 320 });
  });

  it("skips what was missed while paused", async () => {
    await rule({ start_date: "2026-11-01" });
    const [saved] = await ctx.repo.listRecurringRules();
    await setRecurringActive(ctx, saved.id, false);

    const later = { ...ctx, today: "2027-02-15" };
    await generateDueRecurring(later);
    expect(await ctx.repo.listTransactions("2026-12-01", "2027-03-01")).toEqual([]);

    await setRecurringActive(later, saved.id, true);
    expect((await ctx.repo.listRecurringRules())[0].next_date).toBe("2027-03-01");
    expect(await ctx.repo.listTransactions("2026-12-01", "2027-03-01")).toEqual([]);
  });

  it("refuses an end date before the start", async () => {
    expect(await rule({ end_date: "2026-01-01" })).toEqual({ ok: false, code: "invalid" });
  });

  it("deleting a rule keeps the records it created", async () => {
    await rule();
    const [saved] = await ctx.repo.listRecurringRules();
    await ctx.repo.deleteRecurringRule(saved.id);
    expect(await ctx.repo.listTransactions("2026-01-01", "2026-12-31")).toHaveLength(3);
  });
});

describe("portfolio", () => {
  it("fixes a trade's currency by its market", async () => {
    await buy();
    await buy({ market: "TW", symbol: "2330", fx_rate: null });
    const trades = await ctx.repo.listTrades();
    expect(trades[0]).toMatchObject({ currency: "USD", fx_rate: 30 });
    expect(trades[1]).toMatchObject({ currency: "TWD", fx_rate: 1 });
  });

  it("refuses a US trade with no rate at all", async () => {
    expect(await buy({ fx_rate: null })).toEqual({ ok: false, code: "fxMissing" });
  });

  it("refuses selling more than held", async () => {
    await buy({ quantity: 5 });
    expect(await buy({ side: "sell", quantity: 6 })).toEqual({ ok: false, code: "oversold" });
    expect(await buy({ side: "sell", quantity: 5 })).toEqual({ ok: true });
  });

  it("refuses a change that would leave an earlier sale impossible", async () => {
    await buy({ quantity: 5, date: "2026-10-01" });
    await buy({ side: "sell", quantity: 5, date: "2026-10-02" });
    const [first] = await ctx.repo.listTrades();
    expect(await deleteTrade(ctx, first.id)).toEqual({ ok: false, code: "oversold" });
    expect(await updateTrade(ctx, first.id, { ...first, quantity: 4, fx_rate: 30 })).toEqual({ ok: false, code: "oversold" });
    expect(await ctx.repo.listTrades()).toHaveLength(2);
  });

  it("records a dividend as income linked to the holding", async () => {
    await buy();
    await ctx.repo.setManualFxRate("USD", TODAY, 32);
    await recordDividend(ctx, { market: "US", symbol: "AAPL", amount: 10, date: TODAY, note: "Q4" });
    const view = await getFinanceOverview(ctx, "day", TODAY);
    expect(view.summary.income).toBe(320);

    const portfolio = await getPortfolioView(ctx, market());
    expect(portfolio.dividendsTwd).toBe(320);
    expect(portfolio.dividendsByHolding["US:AAPL"]).toBe(320);
  });

  it("values holdings after a refresh, and saves a snapshot", async () => {
    await buy();
    await refreshMarketData(ctx, market());
    const view = await getPortfolioView(ctx, market());
    expect(view.totals).toMatchObject({ value_twd: 48_000, cost_twd: 30_000, unrealized_twd: 18_000, unpriced: 0 });
    expect(view.snapshots).toEqual([{ date: TODAY, value_twd: 48_000, cost_twd: 30_000 }]);
    expect(view.stale).toBe(false);
  });

  it("keeps one snapshot a day, the latest", async () => {
    await buy();
    await refreshMarketData(ctx, market());
    await setManualPrice(ctx, { market: "US", symbol: "AAPL", price: 200 });
    expect((await ctx.repo.listPortfolioSnapshots(TODAY))).toEqual([{ date: TODAY, value_twd: 64_000, cost_twd: 30_000 }]);
  });

  it("saves no snapshot with nothing traded", async () => {
    await refreshMarketData(ctx, market());
    expect(await ctx.repo.listPortfolioSnapshots("2000-01-01")).toEqual([]);
  });

  it("corrects today's point when the last trade is deleted", async () => {
    await buy();
    const [only] = await ctx.repo.listTrades();
    await deleteTrade(ctx, only.id);
    expect(await ctx.repo.listPortfolioSnapshots(TODAY)).toEqual([{ date: TODAY, value_twd: 0, cost_twd: 0 }]);
  });
});

describe("refreshing market data", () => {
  it("fetches rates once a day", async () => {
    const data = market();
    await refreshMarketData(ctx, data);
    await refreshMarketData(ctx, data);
    expect(data.fxRates).toHaveBeenCalledTimes(1);
    await refreshMarketData({ ...ctx, today: "2026-11-04" }, data);
    expect(data.fxRates).toHaveBeenCalledTimes(2);
  });

  it("leaves a rate set by hand for today alone", async () => {
    await ctx.repo.setManualFxRate("USD", TODAY, 40);
    await refreshMarketData(ctx, market());
    const rates = await ctx.repo.listFxRatesOn(TODAY);
    expect(rates.find((rate) => rate.currency === "USD")).toMatchObject({ rate: 40, source: "manual" });
    expect(rates.find((rate) => rate.currency === "IDR")).toMatchObject({ rate: 0.002, source: "api" });
  });

  it("only looks up what's stale, and what's still held", async () => {
    await buy();
    await buy({ symbol: "MSFT" });
    await buy({ symbol: "MSFT", side: "sell" });
    const data = market();
    await refreshMarketData(ctx, data);
    expect(data.usQuote).toHaveBeenCalledTimes(1);
    expect(data.usQuote).toHaveBeenCalledWith("AAPL");

    await refreshMarketData(ctx, data);
    expect(data.usQuote).toHaveBeenCalledTimes(1);

    await refreshMarketData(ctx, data, true);
    expect(data.usQuote).toHaveBeenCalledTimes(2);
  });

  it("keeps the last known price when a source fails", async () => {
    await buy();
    await refreshMarketData(ctx, market());
    const result = await refreshMarketData(ctx, market({ usQuote: async () => null, fxRates: async () => null }), true);
    expect(result).toEqual({ attempted: 1, failed: 1 });
    expect((await ctx.repo.listPrices())[0]).toMatchObject({ price: 150, source: "finnhub" });
  });

  it("reports when nothing answered", async () => {
    const result = await refreshMarketData(ctx, market({ fxRates: async () => null }));
    expect(result).toEqual({ attempted: 1, failed: 1 });
  });

  it("a price set by hand survives a refresh, and wins", async () => {
    await buy();
    await setManualPrice(ctx, { market: "US", symbol: "AAPL", price: 500 });
    await refreshMarketData(ctx, market());
    const [row] = await ctx.repo.listPrices();
    expect(row).toMatchObject({ price: 150, manual_price: 500 });
    expect((await getPortfolioView(ctx, market())).valued[0]).toMatchObject({ price: 500, price_source: "manual" });
  });

  it("with no Finnhub key, skips US but still does Taiwan", async () => {
    await buy();
    await buy({ market: "TW", symbol: "2330", fx_rate: null });
    const data = market({ hasUsSource: false });
    await refreshMarketData(ctx, data);
    expect(data.usQuote).not.toHaveBeenCalled();
    expect(data.twQuotes).toHaveBeenCalledWith(["2330"]);
    const view = await getPortfolioView(ctx, data);
    expect(view.hasUsSource).toBe(false);
    expect(view.stale).toBe(false);
  });

  it("uses the owner's day, not UTC, for the rate's date", async () => {
    // 2026-11-03 17:00 UTC is already 4 November in Taipei.
    const late = { ...ctx, today: "2026-11-04", now: new Date("2026-11-03T17:00:00Z") };
    await refreshMarketData(late, market());
    expect((await ctx.repo.listFxRatesOn("2026-11-04")).every((rate) => rate.rate_date === "2026-11-04")).toBe(true);
    expect(await ctx.repo.listFxRatesOn("2026-11-03")).toEqual([]);
  });
});

describe("reading the outside sources", () => {
  // Shapes copied from what these services really answered on 2026-11-03.
  it("reads a Finnhub quote", () => {
    expect(parseFinnhubQuote({ c: 261.74, d: 1, dp: 0.5, h: 263, l: 260, o: 261, pc: 259, t: 1582641000 })).toEqual({
      price: 261.74,
      price_date: "2020-02-25",
      source: "finnhub",
    });
  });

  it("treats Finnhub's zero as not found, and ignores anything odd", () => {
    expect(parseFinnhubQuote({ c: 0, t: 0 })).toBeNull();
    expect(parseFinnhubQuote({ error: "Please use an API key." })).toBeNull();
    expect(parseFinnhubQuote(null)).toBeNull();
  });

  it("reads Taiwan Stock Exchange prices, only for symbols asked about", () => {
    const quotes = parseTwseDaily(
      [
        { Date: "1151102", Code: "2330", Name: "台積電", ClosingPrice: "2330.00" },
        { Date: "1151102", Code: "2317", Name: "鴻海", ClosingPrice: "1,250.50" },
        { Date: "1151102", Code: "0050", Name: "No trades", ClosingPrice: "" },
      ],
      ["2330", "2317", "0050"]
    );
    expect(quotes.get("2330")).toEqual({ price: 2330, price_date: "2026-11-02", source: "twse" });
    expect(quotes.get("2317")?.price).toBe(1250.5);
    expect(quotes.has("0050")).toBe(false);
  });

  it("reads Taipei Exchange prices, where a blank is ---", () => {
    const quotes = parseTpexDaily(
      [
        { Date: "1151103", SecuritiesCompanyCode: "00411A", Close: "9.09" },
        { Date: "1151103", SecuritiesCompanyCode: "6488", Close: "---" },
      ],
      ["00411A", "6488"]
    );
    expect(quotes.get("00411A")).toEqual({ price: 9.09, price_date: "2026-11-03", source: "tpex" });
    expect(quotes.has("6488")).toBe(false);
  });

  it("copes with a source changing shape", () => {
    expect(parseTwseDaily({ oops: true }, ["2330"]).size).toBe(0);
    expect(parseTpexDaily("<html>", ["2330"]).size).toBe(0);
  });

  it("works out both rates to TWD through the dollar", () => {
    const rates = parseFxRates({ result: "success", rates: { USD: 1, TWD: 32.589181, IDR: 18144.899424 } });
    expect(rates?.USD).toBe(32.589181);
    expect(rates?.IDR).toBeCloseTo(0.001796, 6);
  });

  it("gives no rates on a failed answer", () => {
    expect(parseFxRates({ result: "error" })).toBeNull();
    expect(parseFxRates({ result: "success", rates: { TWD: 32 } })).toBeNull();
  });
});
