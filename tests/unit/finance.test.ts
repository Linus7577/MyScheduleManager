import { describe, expect, it } from "vitest";
import {
  allocationByHolding,
  allocationByMarket,
  budgetAlerts,
  budgetStatuses,
  buildTrend,
  computeHoldings,
  dueOccurrences,
  effectivePrice,
  firstOccurrenceOnOrAfter,
  isUsMarketOpen,
  monthRange,
  occurrenceDate,
  periodRange,
  portfolioTotals,
  priceIsStale,
  rocDateToIso,
  roundMoney,
  shiftPeriod,
  sumMoney,
  summarize,
  toTwd,
  totalsByCategory,
  valueHoldings,
} from "@/features/finance/logic";
import type { PriceRow, Trade } from "@/features/finance/types";

describe("money", () => {
  it("rounds to cents, including the awkward halves", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(2.344)).toBe(2.34);
  });

  it("adds up without floating-point noise", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  it("converts foreign money with the rate, and leaves TWD alone", () => {
    expect(toTwd(10, "USD", 32.589181)).toBe(325.89);
    expect(toTwd(50_000, "IDR", 0.00179)).toBe(89.5);
    expect(toTwd(100, "TWD", 999)).toBe(100);
  });
});

describe("periods", () => {
  it("finds a month's range, including a leap February", () => {
    expect(monthRange("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("finds day and year ranges", () => {
    expect(periodRange("day", "2026-11-03")).toEqual({ from: "2026-11-03", to: "2026-11-03" });
    expect(periodRange("year", "2026-11-03")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("moves between periods, across year ends and short months", () => {
    expect(shiftPeriod("day", "2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftPeriod("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftPeriod("month", "2026-01-15", -1)).toBe("2025-12-15");
    expect(shiftPeriod("year", "2028-02-29", 1)).toBe("2029-02-28");
  });
});

describe("summaries", () => {
  const rows = [
    { kind: "expense" as const, amount_twd: 100.1, category_id: "food", date: "2026-11-01" },
    { kind: "expense" as const, amount_twd: 300.2, category_id: "rent", date: "2026-11-02" },
    { kind: "income" as const, amount_twd: 1000, category_id: "pay", date: "2026-11-02" },
    { kind: "expense" as const, amount_twd: 50, category_id: "food", date: "2026-12-05" },
  ];

  it("totals income, expense and net savings", () => {
    expect(summarize(rows.slice(0, 3))).toEqual({ income: 1000, expense: 400.3, net: 599.7 });
    expect(summarize([])).toEqual({ income: 0, expense: 0, net: 0 });
  });

  it("can show spending more than income as a negative net", () => {
    expect(summarize([rows[1]]).net).toBe(-300.2);
  });

  it("breaks spending down by category, largest first", () => {
    expect(totalsByCategory(rows.slice(0, 3), "expense")).toEqual([
      { category_id: "rent", total: 300.2, percent: 75 },
      { category_id: "food", total: 100.1, percent: 25 },
    ]);
    expect(totalsByCategory([], "income")).toEqual([]);
  });

  it("builds a day-by-day trend for a month, including empty days", () => {
    const trend = buildTrend("month", "2026-11-15", rows);
    expect(trend).toHaveLength(30);
    expect(trend[1]).toEqual({ key: "2026-11-02", income: 1000, expense: 300.2, net: 699.8 });
    expect(trend[2]).toEqual({ key: "2026-11-03", income: 0, expense: 0, net: 0 });
  });

  it("builds a month-by-month trend for a year", () => {
    const trend = buildTrend("year", "2026-11-15", rows);
    expect(trend).toHaveLength(12);
    expect(trend[10]).toEqual({ key: "2026-11", income: 1000, expense: 400.3, net: 599.7 });
    expect(trend[11].expense).toBe(50);
  });
});

describe("budgets", () => {
  const budget = { id: "b", category_id: "food", amount_twd: 1000 };
  const spend = (amount_twd: number) => [{ kind: "expense" as const, category_id: "food", amount_twd }];

  it.each([
    [799, 79, "ok"],
    [799.99, 79, "ok"],
    [800, 80, "warning"],
    [999.99, 99, "warning"],
    [1000, 100, "over"],
    [1500, 150, "over"],
  ])("spending %d of 1000 is %d%%, level %s", (amount, percent, level) => {
    expect(budgetStatuses([budget], spend(amount))[0]).toMatchObject({ percent, level, spent_twd: amount });
  });

  it("counts only that category's spending, not income or other categories", () => {
    const rows = [
      ...spend(100),
      { kind: "expense" as const, category_id: "rent", amount_twd: 900 },
      { kind: "income" as const, category_id: "food", amount_twd: 900 },
    ];
    expect(budgetStatuses([budget], rows)[0].spent_twd).toBe(100);
  });

  it("isn't thrown by floating-point noise right on the line", () => {
    const rows = [...spend(266.67), ...spend(266.67), ...spend(266.66)];
    expect(budgetStatuses([budget], rows)[0]).toMatchObject({ percent: 80, level: "warning" });
  });

  it("lists alerts worst first, leaving out healthy budgets", () => {
    const statuses = budgetStatuses(
      [budget, { id: "c", category_id: "fun", amount_twd: 100 }, { id: "d", category_id: "rent", amount_twd: 100 }],
      [...spend(850), { kind: "expense", category_id: "fun", amount_twd: 120 }, { kind: "expense", category_id: "rent", amount_twd: 1 }]
    );
    expect(budgetAlerts(statuses).map((status) => status.category_id)).toEqual(["fun", "food"]);
  });
});

describe("recurring", () => {
  const rule = {
    start_date: "2026-01-31",
    frequency: "monthly" as const,
    next_date: "2026-01-31",
    end_date: null,
    active: true,
  };

  it("keeps the 31st after a short month instead of drifting", () => {
    expect(occurrenceDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(dueOccurrences(rule, "2026-04-01").dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("repeats weekly and yearly", () => {
    expect(occurrenceDate("2026-11-03", "weekly", 2)).toBe("2026-11-17");
    expect(occurrenceDate("2028-02-29", "yearly", 1)).toBe("2029-02-28");
  });

  it("says what comes next", () => {
    expect(dueOccurrences(rule, "2026-04-01").nextDate).toBe("2026-04-30");
    expect(dueOccurrences({ ...rule, next_date: "2026-02-28" }, "2026-02-27")).toEqual({ dates: [], nextDate: "2026-02-28" });
  });

  it("creates each repeat once: continuing from next_date never repeats one", () => {
    const first = dueOccurrences(rule, "2026-02-28");
    const second = dueOccurrences({ ...rule, next_date: first.nextDate }, "2026-03-31");
    expect(first.dates).toEqual(["2026-01-31", "2026-02-28"]);
    expect(second.dates).toEqual(["2026-03-31"]);
  });

  it("creates a repeat falling exactly on today", () => {
    expect(dueOccurrences({ ...rule, start_date: "2026-11-03", next_date: "2026-11-03" }, "2026-11-03").dates).toEqual(["2026-11-03"]);
  });

  it("stops at the end date, and does nothing while paused", () => {
    expect(dueOccurrences({ ...rule, end_date: "2026-02-28" }, "2026-12-31").dates).toEqual(["2026-01-31", "2026-02-28"]);
    expect(dueOccurrences({ ...rule, active: false }, "2026-12-31").dates).toEqual([]);
  });

  it("limits one run, and the rest come on the next", () => {
    const first = dueOccurrences({ ...rule, frequency: "weekly", start_date: "2026-01-01", next_date: "2026-01-01" }, "2026-12-31", 2);
    expect(first).toEqual({ dates: ["2026-01-01", "2026-01-08"], nextDate: "2026-01-15" });
  });

  it("finds the first repeat on or after a date", () => {
    expect(firstOccurrenceOnOrAfter("2026-01-31", "monthly", "2026-03-01")).toBe("2026-03-31");
    expect(firstOccurrenceOnOrAfter("2026-01-31", "monthly", "2026-02-28")).toBe("2026-02-28");
    expect(firstOccurrenceOnOrAfter("2026-11-10", "weekly", "2026-01-01")).toBe("2026-11-10");
    expect(firstOccurrenceOnOrAfter("2020-02-29", "yearly", "2026-03-01")).toBe("2027-02-28");
  });
});

const trade = (patch: Partial<Trade>): Trade => ({
  id: "t",
  side: "buy",
  market: "US",
  symbol: "AAPL",
  quantity: 10,
  price: 100,
  fee: 0,
  date: "2026-01-01",
  note: "",
  currency: "USD",
  fx_rate: 30,
  created_at: "2026-01-01T00:00:00Z",
  ...patch,
});

describe("holdings", () => {
  it("averages the cost across buys, counting fees", () => {
    const { holdings } = computeHoldings([
      trade({ quantity: 10, price: 100, fee: 5 }),
      trade({ quantity: 10, price: 120, fee: 5, date: "2026-01-02" }),
    ]);
    expect(holdings[0]).toMatchObject({ quantity: 20, cost: 2210, average_cost: 110.5, realized: 0 });
  });

  it("works out realized profit when selling, and keeps the average cost of the rest", () => {
    const { holdings } = computeHoldings([
      trade({ quantity: 10, price: 100 }),
      trade({ side: "sell", quantity: 4, price: 150, fee: 10, date: "2026-02-01" }),
    ]);
    // Sold for 600 less a 10 fee, against 400 of cost: 190 gained.
    expect(holdings[0]).toMatchObject({ quantity: 6, cost: 600, average_cost: 100, realized: 190 });
  });

  it("handles a loss", () => {
    const { holdings } = computeHoldings([
      trade({ quantity: 10, price: 100 }),
      trade({ side: "sell", quantity: 10, price: 80, date: "2026-02-01" }),
    ]);
    expect(holdings[0].realized).toBe(-200);
  });

  it("includes currency gains in TWD: the stock didn't move, but the dollar did", () => {
    const { holdings } = computeHoldings([
      trade({ quantity: 1, price: 100, fx_rate: 30 }),
      trade({ side: "sell", quantity: 1, price: 100, fx_rate: 33, date: "2026-02-01" }),
    ]);
    expect(holdings[0]).toMatchObject({ realized: 0, realized_twd: 300 });
  });

  it("clears the cost when everything is sold, but keeps the realized result", () => {
    const { holdings } = computeHoldings([
      trade({ quantity: 3, price: 33.33 }),
      trade({ side: "sell", quantity: 3, price: 40, date: "2026-02-01" }),
    ]);
    expect(holdings[0]).toMatchObject({ quantity: 0, cost: 0, cost_twd: 0, average_cost: 0, realized: 20.01 });
  });

  it("handles fractional shares without leaving dust", () => {
    const { holdings } = computeHoldings([
      trade({ quantity: 0.1 }),
      trade({ quantity: 0.2, date: "2026-01-02" }),
      trade({ side: "sell", quantity: 0.3, date: "2026-01-03" }),
    ]);
    expect(holdings[0].quantity).toBe(0);
  });

  it("flags selling more than is held, judged by date, not by entry order", () => {
    expect(computeHoldings([trade({ side: "sell", quantity: 1 })]).oversold).toBe(true);
    expect(
      computeHoldings([trade({ quantity: 5, date: "2026-02-01" }), trade({ side: "sell", quantity: 1, date: "2026-01-01" })]).oversold
    ).toBe(true);
    expect(
      computeHoldings([trade({ side: "sell", quantity: 1, date: "2026-02-01" }), trade({ quantity: 5, date: "2026-01-01" })]).oversold
    ).toBe(false);
  });

  it("keeps the same symbol on different markets apart", () => {
    const { holdings } = computeHoldings([trade({}), trade({ market: "TW", currency: "TWD", fx_rate: 1 })]);
    expect(holdings).toHaveLength(2);
  });
});

describe("valuing holdings", () => {
  const price = (patch: Partial<PriceRow>): PriceRow => ({
    market: "US",
    symbol: "AAPL",
    currency: "USD",
    price: 150,
    price_date: "2026-11-03",
    source: "finnhub",
    checked_at: "2026-11-03T00:00:00Z",
    manual_price: null,
    ...patch,
  });
  const rate = (currency: string) => (currency === "TWD" ? 1 : 32);
  const holdings = computeHoldings([trade({ quantity: 10, price: 100, fee: 0, fx_rate: 30 })]).holdings;

  it("works out market value and unrealized profit in both currencies", () => {
    expect(valueHoldings(holdings, [price({})], rate)[0]).toMatchObject({
      market_value: 1500,
      market_value_twd: 48_000,
      unrealized: 500,
      unrealized_twd: 18_000,
      unrealized_percent: 50,
    });
  });

  it("lets a price set by hand win", () => {
    expect(effectivePrice(price({ manual_price: 7 }))).toEqual({ price: 7, price_date: null, price_source: "manual" });
    expect(valueHoldings(holdings, [price({ manual_price: 200 })], rate)[0]).toMatchObject({ market_value: 2000, price_source: "manual" });
  });

  it("copes with no price: total uses cost and says how many are missing", () => {
    const valued = valueHoldings(holdings, [], rate);
    expect(valued[0].market_value).toBeNull();
    expect(portfolioTotals(valued)).toEqual({ value_twd: 30_000, cost_twd: 30_000, unrealized_twd: 0, realized_twd: 0, unpriced: 1 });
  });

  it("copes with no exchange rate", () => {
    const valued = valueHoldings(holdings, [price({})], () => null);
    expect(valued[0]).toMatchObject({ market_value: 1500, market_value_twd: null, unrealized: 500, unrealized_twd: null });
    expect(portfolioTotals(valued).unpriced).toBe(1);
  });

  it("totals open holdings, and still counts realized from sold-out ones", () => {
    const mixed = computeHoldings([
      trade({ quantity: 10, price: 100 }),
      trade({ symbol: "MSFT", quantity: 1, price: 100 }),
      trade({ symbol: "MSFT", side: "sell", quantity: 1, price: 110, date: "2026-02-01" }),
    ]).holdings;
    const totals = portfolioTotals(valueHoldings(mixed, [price({})], rate));
    expect(totals).toEqual({ value_twd: 48_000, cost_twd: 30_000, unrealized_twd: 18_000, realized_twd: 300, unpriced: 0 });
  });

  it("splits allocation by holding and by market, leaving out what's sold", () => {
    const mixed = computeHoldings([
      trade({ quantity: 10, price: 100 }),
      trade({ market: "TW", symbol: "2330", currency: "TWD", fx_rate: 1, quantity: 10, price: 1600 }),
      trade({ symbol: "MSFT", quantity: 1, price: 1 }),
      trade({ symbol: "MSFT", side: "sell", quantity: 1, price: 1, date: "2026-02-01" }),
    ]).holdings;
    const valued = valueHoldings(mixed, [price({}), price({ market: "TW", symbol: "2330", currency: "TWD", price: 1600 })], rate);
    expect(allocationByHolding(valued)).toEqual([
      { key: "US:AAPL", label: "AAPL", value_twd: 48_000, percent: 75 },
      { key: "TW:2330", label: "2330", value_twd: 16_000, percent: 25 },
    ]);
    expect(allocationByMarket(valued).map((slice) => [slice.key, slice.percent])).toEqual([
      ["US", 75],
      ["TW", 25],
    ]);
  });
});

describe("price freshness", () => {
  // 2026-11-03 is a Tuesday. New York is on winter time, 13 hours behind Taipei.
  const tradingHours = new Date("2026-11-03T15:00:00Z"); // 10:00 in New York
  const overnight = new Date("2026-11-03T03:00:00Z"); // 22:00 the night before
  const saturday = new Date("2026-11-07T15:00:00Z");

  it("knows when New York is trading", () => {
    expect(isUsMarketOpen(tradingHours)).toBe(true);
    expect(isUsMarketOpen(overnight)).toBe(false);
    expect(isUsMarketOpen(saturday)).toBe(false);
  });

  it("opens at 09:30 and closes at 16:00 exactly", () => {
    expect(isUsMarketOpen(new Date("2026-11-03T14:29:00Z"))).toBe(false);
    expect(isUsMarketOpen(new Date("2026-11-03T14:30:00Z"))).toBe(true);
    expect(isUsMarketOpen(new Date("2026-11-03T20:59:00Z"))).toBe(true);
    expect(isUsMarketOpen(new Date("2026-11-03T21:00:00Z"))).toBe(false);
  });

  it("refreshes US prices every 15 minutes while trading", () => {
    const ago = (minutes: number) => new Date(tradingHours.getTime() - minutes * 60_000).toISOString();
    expect(priceIsStale(ago(14), "US", tradingHours)).toBe(false);
    expect(priceIsStale(ago(15), "US", tradingHours)).toBe(true);
  });

  it("waits longer when the market is shut, and for Taiwan's daily figures", () => {
    const ago = (from: Date, minutes: number) => new Date(from.getTime() - minutes * 60_000).toISOString();
    expect(priceIsStale(ago(overnight, 60), "US", overnight)).toBe(false);
    expect(priceIsStale(ago(overnight, 360), "US", overnight)).toBe(true);
    expect(priceIsStale(ago(tradingHours, 60), "TW", tradingHours)).toBe(false);
    expect(priceIsStale(ago(tradingHours, 360), "TW", tradingHours)).toBe(true);
  });

  it("treats a symbol never looked up as stale", () => {
    expect(priceIsStale(null, "US", overnight)).toBe(true);
  });

  it("reads Taiwan's Minguo dates", () => {
    expect(rocDateToIso("1151102")).toBe("2026-11-02");
    expect(rocDateToIso("nonsense")).toBeNull();
  });
});
