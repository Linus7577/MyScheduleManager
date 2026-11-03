import type { Currency, ForeignCurrency, Market } from "@/config/finance.config";

export type TransactionKind = "expense" | "income";
export type RecurringFrequency = "weekly" | "monthly" | "yearly";
export type TradeSide = "buy" | "sell";
export type PriceSource = "finnhub" | "twse" | "tpex";
export type FinanceView = "day" | "month" | "year";

export type FinCategory = {
  id: string;
  kind: TransactionKind;
  /** Set for a default category, which can be found by it however it's named. */
  key: string | null;
  /** Empty for a default category not renamed yet, which shows its translated name. */
  name: string;
  position: number;
  archived: boolean;
};

export type HoldingRef = { market: Market; symbol: string };

export type TransactionFields = {
  kind: TransactionKind;
  amount: number;
  currency: Currency;
  date: string;
  category_id: string;
  note: string;
  payment_method: string;
  holding_market: Market | null;
  holding_symbol: string | null;
};

export type NewTransaction = TransactionFields & {
  /** What one unit of the currency was worth in TWD. Always 1 for TWD. */
  fx_rate: number;
  amount_twd: number;
  recurring_rule_id: string | null;
  recurring_date: string | null;
};

export type Transaction = NewTransaction & { id: string; created_at: string };

export type RecurringFields = {
  kind: TransactionKind;
  amount: number;
  currency: Currency;
  category_id: string;
  note: string;
  payment_method: string;
  end_date: string | null;
  active: boolean;
};

export type RecurringRule = RecurringFields & {
  id: string;
  frequency: RecurringFrequency;
  start_date: string;
  /** The next repeat not created yet. */
  next_date: string;
};

export type Budget = { id: string; category_id: string; amount_twd: number };

export type TradeFields = {
  side: TradeSide;
  market: Market;
  symbol: string;
  quantity: number;
  price: number;
  fee: number;
  date: string;
  note: string;
};

export type NewTrade = TradeFields & { currency: Currency; fx_rate: number };

export type Trade = NewTrade & { id: string; created_at: string };

export type PriceRow = {
  market: Market;
  symbol: string;
  currency: Currency;
  price: number | null;
  price_date: string | null;
  source: PriceSource | null;
  /** When this symbol was last looked up, found or not. */
  checked_at: string | null;
  /** Set by hand. While set, it wins over the fetched price. */
  manual_price: number | null;
};

export type FetchedPrice = {
  market: Market;
  symbol: string;
  currency: Currency;
  price: number | null;
  price_date: string | null;
  source: PriceSource | null;
  checked_at: string;
};

export type FxRate = {
  currency: ForeignCurrency;
  rate_date: string;
  rate: number;
  source: "api" | "manual";
};

export type PortfolioSnapshot = { date: string; value_twd: number; cost_twd: number };

export type BudgetLevel = "ok" | "warning" | "over";

export type BudgetStatus = {
  category_id: string;
  amount_twd: number;
  spent_twd: number;
  /** Rounded down, so it doesn't claim 100% before the budget is really reached. */
  percent: number;
  level: BudgetLevel;
};

export type Holding = {
  market: Market;
  symbol: string;
  currency: Currency;
  quantity: number;
  /** What's still held cost this much, fees included. */
  cost: number;
  cost_twd: number;
  average_cost: number;
  realized: number;
  realized_twd: number;
};

export type ValuedHolding = Holding & {
  /** The price in use, whichever source it came from. Null if there isn't one. */
  price: number | null;
  price_date: string | null;
  price_source: PriceSource | "manual" | null;
  market_value: number | null;
  market_value_twd: number | null;
  unrealized: number | null;
  unrealized_twd: number | null;
  unrealized_percent: number | null;
};

export type PortfolioTotals = {
  /** Holdings with no price count at what they cost, so the total doesn't drop to nothing. */
  value_twd: number;
  cost_twd: number;
  unrealized_twd: number;
  realized_twd: number;
  unpriced: number;
};

export type AllocationSlice = { key: string; label: string; value_twd: number; percent: number };
