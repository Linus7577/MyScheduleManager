/** Every tunable finance number and default lives here. */

export const CURRENCIES = ["TWD", "USD", "IDR"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** All totals, budgets and charts are in this currency. */
export const BASE_CURRENCY: Currency = "TWD";

export const FOREIGN_CURRENCIES = ["USD", "IDR"] as const;
export type ForeignCurrency = (typeof FOREIGN_CURRENCIES)[number];

export const CURRENCY_DISPLAY_DECIMALS: Record<Currency, { min: number; max: number }> = {
  TWD: { min: 0, max: 2 },
  USD: { min: 2, max: 2 },
  IDR: { min: 0, max: 2 },
};

export const MARKETS = ["US", "TW"] as const;
export type Market = (typeof MARKETS)[number];

/** A market trades in one currency, so a holding's average cost is never a mix of two. */
export const MARKET_CURRENCY: Record<Market, Currency> = { US: "USD", TW: "TWD" };

export const MAX_AMOUNT = 999_999_999_999;
export const MAX_QUANTITY = 999_999_999;

/** Default categories. Each key has a translated name until the owner renames it. */
export const DEFAULT_CATEGORIES = {
  expense: [
    "food",
    "transport",
    "housing",
    "utilities",
    "education",
    "health",
    "shopping",
    "entertainment",
    "subscriptions",
    "travel",
    "gifts",
    "otherExpense",
  ],
  income: ["allowance", "partTime", "scholarship", "investmentIncome", "otherIncome"],
} as const;

/** Dividends go to this category, so they count as income like the spec asks. */
export const DIVIDEND_CATEGORY_KEY = "investmentIncome";

export const BUDGET_WARNING_PERCENT = 80;
export const BUDGET_LIMIT_PERCENT = 100;

/** How many missed repeats one run may create for a rule, so a very old start date can't run away. */
export const RECURRING_CATCH_UP_LIMIT = 120;

export const US_MARKET = { timeZone: "America/New_York", open: "09:30", close: "16:00" } as const;

// US prices are live during trading hours. Nothing changes overnight, and Taiwan's figures are published once a day.
export const US_PRICE_TTL_OPEN_MINUTES = 15;
export const US_PRICE_TTL_CLOSED_MINUTES = 360;
export const TW_PRICE_TTL_MINUTES = 360;

export const MARKET_FETCH_TIMEOUT_MS = 8_000;

export const SNAPSHOT_HISTORY_DAYS = 365;

export const MARKET_SOURCES = {
  finnhubQuote: "https://finnhub.io/api/v1/quote",
  twseDaily: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  tpexDaily: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes",
  fx: "https://open.er-api.com/v6/latest/USD",
  fxAttribution: "https://www.exchangerate-api.com",
} as const;
