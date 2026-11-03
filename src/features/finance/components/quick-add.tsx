"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Delete, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, BASE_CURRENCY, type Currency } from "@/config/finance.config";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { cn } from "@/lib/utils";
import { createTransactionAction } from "../actions";
import { toTwd } from "../logic";
import type { FinCategory, FxRate, TransactionKind } from "../types";
import { categoryLabel, moneyFormat } from "./format";

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];
const AMOUNT_PATTERN = /^\d{0,12}(\.\d{0,2})?$/;

function NumberPad(props: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations("finance");

  function press(key: string) {
    const next = props.value === "0" && key !== "." ? key : `${props.value}${key}`;
    if (AMOUNT_PATTERN.test(next)) props.onChange(next);
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {PAD_KEYS.map((key) => (
        <Button key={key} type="button" variant="outline" className="h-12 text-lg tabular-nums" onClick={() => press(key)}>
          {key}
        </Button>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-12"
        aria-label={t("backspace")}
        onClick={() => props.onChange(props.value.slice(0, -1))}
      >
        <Delete className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * Number pad first: tap Add, type the amount, tap a category, and it's saved. Everything else has a sensible
 * default, and sits behind More details for the times it matters.
 */
export function QuickAdd(props: { categories: FinCategory[]; rates: FxRate[]; today: string; startOpen?: boolean }) {
  const t = useTranslations("finance");
  const names = useTranslations("financeCategories");
  const format = useFormatter();
  const { pending, error, run, clearError } = useScheduleAction();

  const [open, setOpen] = useState(props.startOpen ?? false);
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [currency, setCurrency] = useState<Currency>(BASE_CURRENCY);
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState(false);
  const [date, setDate] = useState(props.today);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState("");
  const [rateText, setRateText] = useState("");

  const value = Number(amount);
  const hasAmount = amount !== "" && value > 0;
  const storedRate = props.rates.find((rate) => rate.currency === currency)?.rate ?? null;
  const givenRate = rateText !== "" && Number(rateText) > 0 ? Number(rateText) : null;
  const rate = currency === BASE_CURRENCY ? 1 : (givenRate ?? storedRate);
  const needsRate = currency !== BASE_CURRENCY && rate === null;

  function reset() {
    setAmount("");
    setNote("");
    setPayment("");
    setRateText("");
    setDate(props.today);
    setDetails(false);
    clearError();
  }

  function close() {
    setOpen(false);
    reset();
  }

  function save(categoryId: string) {
    run(
      () =>
        createTransactionAction({
          kind,
          amount: value,
          currency,
          date,
          category_id: categoryId,
          note,
          payment_method: payment,
          fx_rate: currency === BASE_CURRENCY ? null : givenRate,
        }),
      close
    );
  }

  const choices = props.categories.filter((category) => category.kind === kind && !category.archived);

  return (
    <>
      <Button type="button" className="h-12 gap-1.5 px-5 text-base" onClick={() => setOpen(true)}>
        <Plus className="size-5" aria-hidden="true" />
        {t("add")}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="max-h-[92dvh] gap-3 overflow-y-auto sm:max-w-md">
          <DialogTitle className="text-lg">{t("addTitle")}</DialogTitle>

          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t("kindLabel")}>
            {(["expense", "income"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant="outline"
                aria-pressed={kind === option}
                className={cn("h-10", kind === option && "bg-surface-2 ring-2 ring-foreground/40")}
                onClick={() => setKind(option)}
              >
                {t(option)}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="quick-amount" className="sr-only">
              {t("amount")}
            </Label>
            {/* inputMode none keeps the phone's keyboard away, as the pad below does the job. A desktop keyboard still works. */}
            <Input
              id="quick-amount"
              autoFocus
              inputMode="none"
              autoComplete="off"
              placeholder="0"
              className="h-14 min-w-0 flex-1 text-right text-3xl font-semibold tabular-nums md:text-3xl"
              value={amount}
              onChange={(event) => {
                if (AMOUNT_PATTERN.test(event.target.value)) setAmount(event.target.value);
              }}
            />
            <div role="group" aria-label={t("currency")} className="flex shrink-0 flex-col gap-1">
              {CURRENCIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={currency === option}
                  className={cn(
                    "h-7 rounded-md px-2 text-xs",
                    currency === option ? "bg-surface-2 text-foreground ring-1 ring-foreground/40" : "text-muted-foreground"
                  )}
                  onClick={() => setCurrency(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {currency !== BASE_CURRENCY && hasAmount && rate !== null && (
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {t("convertedPreview", { amount: format.number(toTwd(value, currency, rate), moneyFormat(BASE_CURRENCY)), rate: format.number(rate, { maximumFractionDigits: 6 }) })}
            </p>
          )}

          <NumberPad value={amount} onChange={setAmount} />

          <p className="text-xs text-muted-foreground">{t("tapToSave")}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {choices.map((category) => {
              const label = categoryLabel(category, (key) => names(key));
              return (
                <Button
                  key={category.id}
                  type="button"
                  variant="outline"
                  disabled={!hasAmount || pending || needsRate}
                  aria-label={t("saveTo", { category: label })}
                  className="h-auto min-h-11 whitespace-normal px-1.5 py-1 text-xs leading-tight"
                  onClick={() => save(category.id)}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          {needsRate && (
            <p role="alert" className="text-sm text-destructive">
              {t("needsRate", { currency })}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="button" variant="ghost" className="h-10 w-fit px-2" aria-expanded={details || needsRate} onClick={() => setDetails(!details)}>
            {t("moreDetails")}
          </Button>

          {(details || needsRate) && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="quick-date">{t("date")}</Label>
                <Input id="quick-date" type="date" required className="h-11" value={date} onChange={(event) => setDate(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="quick-note">{t("note")}</Label>
                <Input id="quick-note" maxLength={500} className="h-11" value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="quick-payment">{t("paymentMethod")}</Label>
                <Input id="quick-payment" maxLength={40} className="h-11" value={payment} onChange={(event) => setPayment(event.target.value)} />
              </div>
              {currency !== BASE_CURRENCY && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="quick-rate">{t("rateToTwd", { currency })}</Label>
                  <Input
                    id="quick-rate"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    className="h-11"
                    placeholder={storedRate === null ? "" : String(storedRate)}
                    value={rateText}
                    onChange={(event) => setRateText(event.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
