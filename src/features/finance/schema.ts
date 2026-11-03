import { z } from "zod";
import { CURRENCIES, FOREIGN_CURRENCIES, MARKETS, MAX_AMOUNT, MAX_QUANTITY } from "@/config/finance.config";
import { dateSchema } from "@/features/schedule/schema";
import { roundMoney } from "./logic";

const id = z.uuid();
const kind = z.enum(["expense", "income"]);
const currency = z.enum(CURRENCIES);
const market = z.enum(MARKETS);
const amount = z.number().min(0.01).max(MAX_AMOUNT).transform(roundMoney);
const fxRate = z.number().positive().max(1_000_000);
const note = z.string().trim().max(500);
const paymentMethod = z.string().trim().max(40);
const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9.-]{0,15}$/);

export const idOnlySchema = z.strictObject({ id });

const transactionFields = {
  kind,
  amount,
  currency,
  date: dateSchema,
  category_id: id,
  note,
  payment_method: paymentMethod,
  /** Left empty to use the stored rate for that date. */
  fx_rate: fxRate.nullable(),
};
export const createTransactionSchema = z.strictObject(transactionFields);
export const updateTransactionSchema = z.strictObject({ id, ...transactionFields });

const categoryName = z.string().trim().min(1).max(40);
export const createCategorySchema = z.strictObject({ kind, name: categoryName });
export const renameCategorySchema = z.strictObject({ id, name: categoryName });
export const archiveCategorySchema = z.strictObject({ id, archived: z.boolean() });

const recurringFields = {
  kind,
  amount,
  currency,
  category_id: id,
  note,
  payment_method: paymentMethod,
  end_date: dateSchema.nullable(),
};
export const createRecurringSchema = z.strictObject({
  ...recurringFields,
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  start_date: dateSchema,
});
export const updateRecurringSchema = z.strictObject({ id, ...recurringFields });
export const setRecurringActiveSchema = z.strictObject({ id, active: z.boolean() });

export const setBudgetSchema = z.strictObject({ category_id: id, amount_twd: amount });
export const deleteBudgetSchema = z.strictObject({ category_id: id });

const tradeFields = {
  side: z.enum(["buy", "sell"]),
  market,
  symbol,
  quantity: z.number().positive().max(MAX_QUANTITY),
  price: z.number().min(0).max(MAX_AMOUNT),
  fee: z.number().min(0).max(MAX_AMOUNT).transform(roundMoney),
  date: dateSchema,
  note,
  fx_rate: fxRate.nullable(),
};
export const createTradeSchema = z.strictObject(tradeFields);
export const updateTradeSchema = z.strictObject({ id, ...tradeFields });

export const dividendSchema = z.strictObject({ market, symbol, amount, date: dateSchema, note });

export const setManualPriceSchema = z.strictObject({
  market,
  symbol,
  price: z.number().min(0).max(MAX_AMOUNT).nullable(),
});

export const setManualFxSchema = z.strictObject({ currency: z.enum(FOREIGN_CURRENCIES), rate: fxRate });

export const refreshMarketSchema = z.strictObject({ force: z.boolean() });
