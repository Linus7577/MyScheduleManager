import { CURRENCY_DISPLAY_DECIMALS, type Currency } from "@/config/finance.config";
import type { FinCategory } from "../types";

/** How to show an amount of money, for format.number on the server or in the browser. */
export function moneyFormat(currency: Currency) {
  const { min, max } = CURRENCY_DISPLAY_DECIMALS[currency];
  return { style: "currency", currency, minimumFractionDigits: min, maximumFractionDigits: max } as const;
}

/** Gain or loss, always with its sign, so it's never told apart by colour alone. */
export function signedMoneyFormat(currency: Currency) {
  return { ...moneyFormat(currency), signDisplay: "exceptZero" } as const;
}

/** A default category shows its translated name until the owner gives it their own. */
export function categoryLabel(category: FinCategory | undefined, t: (key: string) => string): string {
  if (!category) return "";
  return category.name || (category.key ? t(category.key) : "");
}

export const shortDateFormat = { month: "numeric", day: "numeric", timeZone: "UTC" } as const;

export const toUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);
