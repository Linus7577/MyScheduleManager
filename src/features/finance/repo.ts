import type { ForeignCurrency, Market } from "@/config/finance.config";
import type {
  Budget,
  FetchedPrice,
  FinCategory,
  FxRate,
  NewTrade,
  NewTransaction,
  PortfolioSnapshot,
  PriceRow,
  RecurringFields,
  RecurringFrequency,
  RecurringRule,
  Trade,
  Transaction,
  TransactionKind,
} from "./types";

export type NewFinCategory = { kind: TransactionKind; key: string | null; name: string; position: number };
export type NewRecurringRule = RecurringFields & {
  frequency: RecurringFrequency;
  start_date: string;
  next_date: string;
};

export interface FinanceRepo {
  listFinCategories(): Promise<FinCategory[]>;
  /** Defaults already there are left alone, so seeding twice can't create duplicates. */
  insertFinCategories(categories: NewFinCategory[]): Promise<void>;
  updateFinCategory(id: string, patch: Partial<Pick<FinCategory, "name" | "archived">>): Promise<void>;

  listTransactions(from: string, to: string): Promise<Transaction[]>;
  listHoldingIncome(): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | null>;
  createTransaction(transaction: NewTransaction): Promise<void>;
  /** A repeat that already exists is left alone, so creating it twice can't duplicate it. */
  insertRecurringTransactions(transactions: NewTransaction[]): Promise<void>;
  updateTransaction(id: string, transaction: NewTransaction): Promise<void>;
  deleteTransaction(id: string): Promise<void>;

  listRecurringRules(): Promise<RecurringRule[]>;
  getRecurringRule(id: string): Promise<RecurringRule | null>;
  createRecurringRule(rule: NewRecurringRule): Promise<void>;
  updateRecurringRule(id: string, patch: Partial<RecurringFields & { next_date: string }>): Promise<void>;
  deleteRecurringRule(id: string): Promise<void>;

  listBudgets(): Promise<Budget[]>;
  setBudget(categoryId: string, amountTwd: number): Promise<void>;
  deleteBudget(categoryId: string): Promise<void>;

  listTrades(): Promise<Trade[]>;
  createTrade(trade: NewTrade): Promise<void>;
  updateTrade(id: string, trade: NewTrade): Promise<void>;
  deleteTrade(id: string): Promise<void>;

  listPrices(): Promise<PriceRow[]>;
  /** Saves looked-up prices, leaving any price set by hand as it is. */
  savePrices(prices: FetchedPrice[]): Promise<void>;
  setManualPrice(market: Market, symbol: string, currency: PriceRow["currency"], price: number | null): Promise<void>;

  /** Each currency's most recent rate on or before a date. */
  listFxRatesOn(date: string): Promise<FxRate[]>;
  /** Saves fetched rates, leaving a rate set by hand for that date as it is. */
  saveFetchedFxRates(rates: { currency: ForeignCurrency; rate_date: string; rate: number }[]): Promise<void>;
  setManualFxRate(currency: ForeignCurrency, date: string, rate: number): Promise<void>;

  listPortfolioSnapshots(from: string): Promise<PortfolioSnapshot[]>;
  savePortfolioSnapshot(snapshot: PortfolioSnapshot): Promise<void>;
}
