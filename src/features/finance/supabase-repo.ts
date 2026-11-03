import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceRepo } from "./repo";
import type { Budget, FxRate, PortfolioSnapshot, PriceRow, RecurringRule, Trade, Transaction } from "./types";

function unwrapMaybe<T>(result: { data: T | null; error: unknown }): T | null {
  if (result.error) throw new Error("Finance database request failed");
  return result.data;
}

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  const data = unwrapMaybe(result);
  if (data === null) throw new Error("Finance database request returned nothing");
  return data;
}

function check(result: { error: unknown }): void {
  if (result.error) throw new Error("Finance database request failed");
}

// Postgres sends numeric values as strings or numbers depending on size, so they're always converted.
const nullableNumber = (value: unknown) => (value === null ? null : Number(value));

const toTransaction = (row: Transaction): Transaction => ({
  ...row,
  amount: Number(row.amount),
  fx_rate: Number(row.fx_rate),
  amount_twd: Number(row.amount_twd),
});
const toRule = (row: RecurringRule): RecurringRule => ({ ...row, amount: Number(row.amount) });
const toBudget = (row: Budget): Budget => ({ ...row, amount_twd: Number(row.amount_twd) });
const toTrade = (row: Trade): Trade => ({
  ...row,
  quantity: Number(row.quantity),
  price: Number(row.price),
  fee: Number(row.fee),
  fx_rate: Number(row.fx_rate),
});
const toPrice = (row: PriceRow): PriceRow => ({
  ...row,
  price: nullableNumber(row.price),
  manual_price: nullableNumber(row.manual_price),
});
const toFx = (row: FxRate): FxRate => ({ ...row, rate: Number(row.rate) });
const toSnapshot = (row: PortfolioSnapshot): PortfolioSnapshot => ({
  ...row,
  value_twd: Number(row.value_twd),
  cost_twd: Number(row.cost_twd),
});

const CATEGORY_COLUMNS = "id, kind, key, name, position, archived";
const TRANSACTION_COLUMNS =
  "id, kind, amount, currency, fx_rate, amount_twd, date, category_id, note, payment_method, recurring_rule_id, " +
  "recurring_date, holding_market, holding_symbol, created_at";
const RULE_COLUMNS =
  "id, kind, amount, currency, category_id, note, payment_method, frequency, start_date, next_date, end_date, active";
const TRADE_COLUMNS = "id, side, market, symbol, quantity, price, fee, currency, fx_rate, date, note, created_at";
const PRICE_COLUMNS = "market, symbol, currency, price, price_date, source, checked_at, manual_price";
const FX_COLUMNS = "currency, rate_date, rate, source";

const FOREIGN = ["USD", "IDR"] as const;

/** Runs as the signed-in owner, so RLS applies. The daily cron passes a server-only client for the one owner. */
export function createFinanceSupabaseRepo(db: SupabaseClient, userId: string): FinanceRepo {
  return {
    async listFinCategories() {
      return unwrap(await db.from("fin_categories").select(CATEGORY_COLUMNS).order("position"));
    },
    async insertFinCategories(categories) {
      check(
        await db
          .from("fin_categories")
          .upsert(categories.map((category) => ({ ...category, user_id: userId })), {
            onConflict: "user_id,key",
            ignoreDuplicates: true,
          })
      );
    },
    async updateFinCategory(id, patch) {
      check(await db.from("fin_categories").update(patch).eq("id", id));
    },

    async listTransactions(from, to) {
      const rows = unwrap(
        await db
          .from("transactions")
          .select(TRANSACTION_COLUMNS)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
      );
      return (rows as unknown as Transaction[]).map(toTransaction);
    },
    async listHoldingIncome() {
      const rows = unwrap(
        await db
          .from("transactions")
          .select(TRANSACTION_COLUMNS)
          .not("holding_symbol", "is", null)
          .order("date", { ascending: false })
      );
      return (rows as unknown as Transaction[]).map(toTransaction);
    },
    async getTransaction(id) {
      const row = unwrapMaybe(await db.from("transactions").select(TRANSACTION_COLUMNS).eq("id", id).maybeSingle());
      return row ? toTransaction(row as unknown as Transaction) : null;
    },
    async createTransaction(transaction) {
      check(await db.from("transactions").insert({ ...transaction, user_id: userId }));
    },
    async insertRecurringTransactions(transactions) {
      if (transactions.length === 0) return;
      check(
        await db
          .from("transactions")
          .upsert(transactions.map((transaction) => ({ ...transaction, user_id: userId })), {
            onConflict: "recurring_rule_id,recurring_date",
            ignoreDuplicates: true,
          })
      );
    },
    async updateTransaction(id, transaction) {
      check(await db.from("transactions").update(transaction).eq("id", id));
    },
    async deleteTransaction(id) {
      check(await db.from("transactions").delete().eq("id", id));
    },

    async listRecurringRules() {
      const rows = unwrap(await db.from("recurring_rules").select(RULE_COLUMNS).order("created_at"));
      return (rows as unknown as RecurringRule[]).map(toRule);
    },
    async getRecurringRule(id) {
      const row = unwrapMaybe(await db.from("recurring_rules").select(RULE_COLUMNS).eq("id", id).maybeSingle());
      return row ? toRule(row as unknown as RecurringRule) : null;
    },
    async createRecurringRule(rule) {
      check(await db.from("recurring_rules").insert({ ...rule, user_id: userId }));
    },
    async updateRecurringRule(id, patch) {
      check(await db.from("recurring_rules").update(patch).eq("id", id));
    },
    async deleteRecurringRule(id) {
      check(await db.from("recurring_rules").delete().eq("id", id));
    },

    async listBudgets() {
      const rows = unwrap(await db.from("budgets").select("id, category_id, amount_twd"));
      return (rows as unknown as Budget[]).map(toBudget);
    },
    async setBudget(categoryId, amountTwd) {
      check(
        await db
          .from("budgets")
          .upsert({ user_id: userId, category_id: categoryId, amount_twd: amountTwd }, { onConflict: "user_id,category_id" })
      );
    },
    async deleteBudget(categoryId) {
      check(await db.from("budgets").delete().eq("category_id", categoryId));
    },

    async listTrades() {
      const rows = unwrap(await db.from("trades").select(TRADE_COLUMNS).order("date").order("created_at"));
      return (rows as unknown as Trade[]).map(toTrade);
    },
    async createTrade(trade) {
      check(await db.from("trades").insert({ ...trade, user_id: userId }));
    },
    async updateTrade(id, trade) {
      check(await db.from("trades").update(trade).eq("id", id));
    },
    async deleteTrade(id) {
      check(await db.from("trades").delete().eq("id", id));
    },

    async listPrices() {
      const rows = unwrap(await db.from("price_cache").select(PRICE_COLUMNS));
      return (rows as unknown as PriceRow[]).map(toPrice);
    },
    async savePrices(prices) {
      if (prices.length === 0) return;
      // A symbol that wasn't found keeps its last known price: only when it was looked up changes.
      const rows = prices.map(({ price, price_date, source, ...rest }) => ({
        ...rest,
        user_id: userId,
        ...(price === null ? {} : { price, price_date, source }),
      }));
      const found = rows.filter((row) => "price" in row);
      const missing = rows.filter((row) => !("price" in row));
      if (found.length > 0) {
        check(await db.from("price_cache").upsert(found, { onConflict: "user_id,market,symbol" }));
      }
      if (missing.length > 0) {
        check(await db.from("price_cache").upsert(missing, { onConflict: "user_id,market,symbol" }));
      }
    },
    async setManualPrice(market, symbol, currency, price) {
      check(
        await db
          .from("price_cache")
          .upsert({ user_id: userId, market, symbol, currency, manual_price: price }, { onConflict: "user_id,market,symbol" })
      );
    },

    async listFxRatesOn(date) {
      const results = await Promise.all(
        FOREIGN.map(async (currency) => {
          const row = unwrapMaybe(
            await db
              .from("fx_rates")
              .select(FX_COLUMNS)
              .eq("currency", currency)
              .lte("rate_date", date)
              .order("rate_date", { ascending: false })
              .limit(1)
              .maybeSingle()
          );
          return row ? toFx(row as unknown as FxRate) : null;
        })
      );
      return results.filter((rate): rate is FxRate => rate !== null);
    },
    async saveFetchedFxRates(rates) {
      if (rates.length === 0) return;
      check(
        await db
          .from("fx_rates")
          .upsert(rates.map((rate) => ({ ...rate, source: "api", user_id: userId })), {
            onConflict: "user_id,currency,rate_date",
            ignoreDuplicates: true,
          })
      );
    },
    async setManualFxRate(currency, date, rate) {
      check(
        await db
          .from("fx_rates")
          .upsert({ user_id: userId, currency, rate_date: date, rate, source: "manual" }, { onConflict: "user_id,currency,rate_date" })
      );
    },

    async listPortfolioSnapshots(from) {
      const rows = unwrap(
        await db.from("portfolio_snapshots").select("date, value_twd, cost_twd").gte("date", from).order("date")
      );
      return (rows as unknown as PortfolioSnapshot[]).map(toSnapshot);
    },
    async savePortfolioSnapshot(snapshot) {
      check(await db.from("portfolio_snapshots").upsert({ ...snapshot, user_id: userId }, { onConflict: "user_id,date" }));
    },
  };
}
