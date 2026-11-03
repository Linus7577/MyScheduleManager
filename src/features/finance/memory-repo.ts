import type { FinanceRepo } from "./repo";
import type {
  Budget,
  FinCategory,
  FxRate,
  PortfolioSnapshot,
  PriceRow,
  RecurringRule,
  Trade,
  Transaction,
} from "./types";

export type FinanceStore = {
  finCategories: FinCategory[];
  transactions: Transaction[];
  rules: RecurringRule[];
  budgets: Budget[];
  trades: Trade[];
  prices: PriceRow[];
  fxRates: FxRate[];
  portfolioSnapshots: PortfolioSnapshot[];
};

export const emptyFinanceStore = (): FinanceStore => ({
  finCategories: [],
  transactions: [],
  rules: [],
  budgets: [],
  trades: [],
  prices: [],
  fxRates: [],
  portfolioSnapshots: [],
});

const newId = () => crypto.randomUUID();

/** Stands in for Supabase in tests and login-free preview. */
export function createFinanceMemoryRepo(store: FinanceStore): FinanceRepo {
  // Entry order breaks ties, as created_at does in the database. Timestamps alone can tie within a millisecond.
  let sequence = 0;
  const stamp = () => new Date(Date.now() + sequence++).toISOString();

  const newestFirst = (a: Transaction, b: Transaction) =>
    b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at);

  return {
    async listFinCategories() {
      return [...store.finCategories].sort((a, b) => a.position - b.position);
    },
    async insertFinCategories(categories) {
      for (const category of categories) {
        if (category.key && store.finCategories.some((existing) => existing.key === category.key)) continue;
        store.finCategories.push({ ...category, id: newId(), archived: false });
      }
    },
    async updateFinCategory(id, patch) {
      store.finCategories = store.finCategories.map((category) => (category.id === id ? { ...category, ...patch } : category));
    },

    async listTransactions(from, to) {
      return store.transactions.filter((row) => row.date >= from && row.date <= to).sort(newestFirst);
    },
    async listHoldingIncome() {
      return store.transactions.filter((row) => row.holding_symbol !== null).sort(newestFirst);
    },
    async getTransaction(id) {
      return store.transactions.find((row) => row.id === id) ?? null;
    },
    async createTransaction(transaction) {
      store.transactions.push({ ...transaction, id: newId(), created_at: stamp() });
    },
    async insertRecurringTransactions(transactions) {
      for (const transaction of transactions) {
        const exists = store.transactions.some(
          (row) => row.recurring_rule_id === transaction.recurring_rule_id && row.recurring_date === transaction.recurring_date
        );
        if (!exists) store.transactions.push({ ...transaction, id: newId(), created_at: stamp() });
      }
    },
    async updateTransaction(id, transaction) {
      store.transactions = store.transactions.map((row) => (row.id === id ? { ...row, ...transaction } : row));
    },
    async deleteTransaction(id) {
      store.transactions = store.transactions.filter((row) => row.id !== id);
    },

    async listRecurringRules() {
      return [...store.rules];
    },
    async getRecurringRule(id) {
      return store.rules.find((rule) => rule.id === id) ?? null;
    },
    async createRecurringRule(rule) {
      store.rules.push({ ...rule, id: newId() });
    },
    async updateRecurringRule(id, patch) {
      store.rules = store.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule));
    },
    async deleteRecurringRule(id) {
      store.rules = store.rules.filter((rule) => rule.id !== id);
      store.transactions = store.transactions.map((row) =>
        row.recurring_rule_id === id ? { ...row, recurring_rule_id: null } : row
      );
    },

    async listBudgets() {
      return [...store.budgets];
    },
    async setBudget(categoryId, amountTwd) {
      const existing = store.budgets.find((budget) => budget.category_id === categoryId);
      if (existing) existing.amount_twd = amountTwd;
      else store.budgets.push({ id: newId(), category_id: categoryId, amount_twd: amountTwd });
    },
    async deleteBudget(categoryId) {
      store.budgets = store.budgets.filter((budget) => budget.category_id !== categoryId);
    },

    async listTrades() {
      return [...store.trades].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    },
    async createTrade(trade) {
      store.trades.push({ ...trade, id: newId(), created_at: stamp() });
    },
    async updateTrade(id, trade) {
      store.trades = store.trades.map((row) => (row.id === id ? { ...row, ...trade } : row));
    },
    async deleteTrade(id) {
      store.trades = store.trades.filter((row) => row.id !== id);
    },

    async listPrices() {
      return [...store.prices];
    },
    async savePrices(prices) {
      for (const fetched of prices) {
        const existing = store.prices.find((row) => row.market === fetched.market && row.symbol === fetched.symbol);
        if (!existing) {
          store.prices.push({ ...fetched, manual_price: null });
        } else {
          existing.checked_at = fetched.checked_at;
          if (fetched.price !== null) {
            existing.price = fetched.price;
            existing.price_date = fetched.price_date;
            existing.source = fetched.source;
          }
        }
      }
    },
    async setManualPrice(market, symbol, currency, price) {
      const existing = store.prices.find((row) => row.market === market && row.symbol === symbol);
      if (existing) existing.manual_price = price;
      else store.prices.push({ market, symbol, currency, price: null, price_date: null, source: null, checked_at: null, manual_price: price });
    },

    async listFxRatesOn(date) {
      const latest = new Map<string, FxRate>();
      for (const rate of store.fxRates) {
        if (rate.rate_date > date) continue;
        const current = latest.get(rate.currency);
        if (!current || rate.rate_date > current.rate_date) latest.set(rate.currency, rate);
      }
      return [...latest.values()];
    },
    async saveFetchedFxRates(rates) {
      for (const rate of rates) {
        const exists = store.fxRates.some((row) => row.currency === rate.currency && row.rate_date === rate.rate_date);
        if (!exists) store.fxRates.push({ ...rate, source: "api" });
      }
    },
    async setManualFxRate(currency, date, rate) {
      store.fxRates = [
        ...store.fxRates.filter((row) => !(row.currency === currency && row.rate_date === date)),
        { currency, rate_date: date, rate, source: "manual" },
      ];
    },

    async listPortfolioSnapshots(from) {
      return store.portfolioSnapshots.filter((row) => row.date >= from).sort((a, b) => a.date.localeCompare(b.date));
    },
    async savePortfolioSnapshot(snapshot) {
      store.portfolioSnapshots = [...store.portfolioSnapshots.filter((row) => row.date !== snapshot.date), snapshot];
    },
  };
}
