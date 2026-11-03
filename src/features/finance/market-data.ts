import { z } from "zod";
import {
  MARKET_FETCH_TIMEOUT_MS,
  MARKET_SOURCES,
  US_MARKET,
  type ForeignCurrency,
} from "@/config/finance.config";
import { rocDateToIso } from "./logic";
import type { PriceSource } from "./types";

export type Quote = { price: number; price_date: string | null; source: PriceSource };

/** The outside world's prices, behind one interface so tests and preview never touch the network. */
export interface MarketData {
  /** False without a Finnhub key, in which case US prices are set by hand. */
  hasUsSource: boolean;
  usQuote(symbol: string): Promise<Quote | null>;
  twQuotes(symbols: string[]): Promise<Map<string, Quote>>;
  fxRates(): Promise<Record<ForeignCurrency, number> | null>;
}

const finnhubSchema = z.object({ c: z.number(), t: z.number().optional() });

/** Finnhub answers an unknown symbol with a price of zero rather than an error. */
export function parseFinnhubQuote(data: unknown): Quote | null {
  const parsed = finnhubSchema.safeParse(data);
  if (!parsed.success || parsed.data.c <= 0) return null;
  const { c, t } = parsed.data;
  return {
    price: c,
    price_date: t ? new Intl.DateTimeFormat("en-CA", { timeZone: US_MARKET.timeZone }).format(new Date(t * 1000)) : null,
    source: "finnhub",
  };
}

function parsePrice(value: string): number | null {
  const price = Number(value.replaceAll(",", ""));
  return Number.isFinite(price) && price > 0 ? price : null;
}

const twseSchema = z.array(z.object({ Code: z.string(), ClosingPrice: z.string(), Date: z.string() }));

/** A stock that didn't trade has a blank closing price, so it's left out. */
export function parseTwseDaily(data: unknown, symbols: string[]): Map<string, Quote> {
  const quotes = new Map<string, Quote>();
  const parsed = twseSchema.safeParse(data);
  if (!parsed.success) return quotes;
  for (const row of parsed.data) {
    const price = parsePrice(row.ClosingPrice);
    if (symbols.includes(row.Code) && price !== null) {
      quotes.set(row.Code, { price, price_date: rocDateToIso(row.Date), source: "twse" });
    }
  }
  return quotes;
}

const tpexSchema = z.array(z.object({ SecuritiesCompanyCode: z.string(), Close: z.string(), Date: z.string() }));

export function parseTpexDaily(data: unknown, symbols: string[]): Map<string, Quote> {
  const quotes = new Map<string, Quote>();
  const parsed = tpexSchema.safeParse(data);
  if (!parsed.success) return quotes;
  for (const row of parsed.data) {
    const price = parsePrice(row.Close);
    if (symbols.includes(row.SecuritiesCompanyCode) && price !== null) {
      quotes.set(row.SecuritiesCompanyCode, { price, price_date: rocDateToIso(row.Date), source: "tpex" });
    }
  }
  return quotes;
}

const fxSchema = z.object({
  result: z.literal("success"),
  rates: z.object({ TWD: z.number().positive(), IDR: z.number().positive() }),
});

/** The source quotes everything against the US dollar, so IDR to TWD goes through it. */
export function parseFxRates(data: unknown): Record<ForeignCurrency, number> | null {
  const parsed = fxSchema.safeParse(data);
  if (!parsed.success) return null;
  const { TWD, IDR } = parsed.data.rates;
  return { USD: TWD, IDR: TWD / IDR };
}

/** Answers null on any failure: a slow or broken source must never break a page. */
async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(MARKET_FETCH_TIMEOUT_MS),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export function createMarketData(finnhubKey: string | undefined): MarketData {
  return {
    hasUsSource: Boolean(finnhubKey),

    async usQuote(symbol) {
      if (!finnhubKey) return null;
      // The key travels in a header, so it can't end up in a log of URLs.
      const url = `${MARKET_SOURCES.finnhubQuote}?symbol=${encodeURIComponent(symbol)}`;
      return parseFinnhubQuote(await fetchJson(url, { "X-Finnhub-Token": finnhubKey }));
    },

    async twQuotes(symbols) {
      if (symbols.length === 0) return new Map();
      const listed = parseTwseDaily(await fetchJson(MARKET_SOURCES.twseDaily), symbols);
      const remaining = symbols.filter((symbol) => !listed.has(symbol));
      if (remaining.length === 0) return listed;
      // Anything not on the main exchange may be on the smaller over-the-counter one.
      return new Map([...listed, ...parseTpexDaily(await fetchJson(MARKET_SOURCES.tpexDaily), remaining)]);
    },

    async fxRates() {
      return parseFxRates(await fetchJson(MARKET_SOURCES.fx));
    },
  };
}

/** Fixed answers for tests and login-free preview. The symbol NOPE is never found. */
export const previewMarketData: MarketData = {
  hasUsSource: true,
  async usQuote(symbol) {
    return symbol === "NOPE" ? null : { price: 150, price_date: "2026-11-02", source: "finnhub" };
  },
  async twQuotes(symbols) {
    return new Map(
      symbols
        .filter((symbol) => symbol !== "NOPE")
        .map((symbol): [string, Quote] => [symbol, { price: 1000, price_date: "2026-11-02", source: "twse" }])
    );
  },
  async fxRates() {
    return { USD: 32, IDR: 0.002 };
  },
};
