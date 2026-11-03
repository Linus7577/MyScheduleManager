"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Pencil, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BASE_CURRENCY, CURRENCIES, type Currency } from "@/config/finance.config";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { FIELD_CLASS } from "@/features/schedule/components/meta";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { deleteTransactionAction, updateTransactionAction } from "../actions";
import type { FinCategory, Transaction } from "../types";
import { categoryLabel, moneyFormat, toUtcDate } from "./format";

function EditDialog(props: { transaction: Transaction; categories: FinCategory[]; onClose: () => void }) {
  const t = useTranslations("finance");
  const names = useTranslations("financeCategories");
  const { pending, error, run } = useScheduleAction();
  const { transaction } = props;
  const [amount, setAmount] = useState(String(transaction.amount));
  const [currency, setCurrency] = useState<Currency>(transaction.currency);
  const [date, setDate] = useState(transaction.date);
  const [categoryId, setCategoryId] = useState(transaction.category_id);
  const [note, setNote] = useState(transaction.note);
  const [payment, setPayment] = useState(transaction.payment_method);
  const [rate, setRate] = useState(transaction.currency === BASE_CURRENCY ? "" : String(transaction.fx_rate));

  const choices = props.categories.filter(
    (category) => category.kind === transaction.kind && (!category.archived || category.id === transaction.category_id)
  );

  function save() {
    run(
      () =>
        updateTransactionAction({
          id: transaction.id,
          kind: transaction.kind,
          amount: Number(amount),
          currency,
          date,
          category_id: categoryId,
          note,
          payment_method: payment,
          fx_rate: currency === BASE_CURRENCY || rate === "" ? null : Number(rate),
        }),
      props.onClose
    );
  }

  return (
    <FormDialog open onClose={props.onClose} title={t("editTitle")} pending={pending} error={error} onSubmit={save}>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="edit-amount">{t("amount")}</Label>
          <Input id="edit-amount" type="number" inputMode="decimal" step="0.01" min="0.01" required className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex w-24 flex-col gap-2">
          <Label htmlFor="edit-currency">{t("currency")}</Label>
          <select
            id="edit-currency"
            className={FIELD_CLASS}
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value as Currency);
              setRate("");
            }}
          >
            {CURRENCIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      {currency !== BASE_CURRENCY && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-rate">{t("rateToTwd", { currency })}</Label>
          <Input id="edit-rate" type="number" inputMode="decimal" step="any" min="0" className="h-11" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-date">{t("date")}</Label>
        <Input id="edit-date" type="date" required className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-category">{t("category")}</Label>
        <select id="edit-category" className={FIELD_CLASS} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {choices.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryLabel(category, (key) => names(key))}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-note">{t("note")}</Label>
        <Input id="edit-note" maxLength={500} className="h-11" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-payment">{t("paymentMethod")}</Label>
        <Input id="edit-payment" maxLength={40} className="h-11" value={payment} onChange={(e) => setPayment(e.target.value)} />
      </div>
    </FormDialog>
  );
}

export function TransactionsList(props: { transactions: Transaction[]; categories: FinCategory[] }) {
  const t = useTranslations("finance");
  const names = useTranslations("financeCategories");
  const format = useFormatter();
  const { pending, error, run } = useScheduleAction();
  const [editing, setEditing] = useState<Transaction | null>(null);

  if (props.transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noTransactions")}</p>;
  }

  function remove(transaction: Transaction, label: string) {
    if (!window.confirm(t("deleteConfirm", { category: label }))) return;
    run(() => deleteTransactionAction({ id: transaction.id }));
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {props.transactions.map((transaction) => {
          const label = categoryLabel(
            props.categories.find((category) => category.id === transaction.category_id),
            (key) => names(key)
          );
          const sign = transaction.kind === "income" ? "+" : "−";
          return (
            <li key={transaction.id} className="flex items-center gap-1 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium break-words">
                  {label}
                  {transaction.recurring_date && (
                    <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("recurringTag")} />
                  )}
                </p>
                <p className="text-xs break-words text-muted-foreground">
                  {[
                    format.dateTime(toUtcDate(transaction.date), { month: "numeric", day: "numeric", timeZone: "UTC" }),
                    transaction.holding_symbol,
                    transaction.note,
                    transaction.payment_method,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="text-sm">
                  {sign}
                  {format.number(transaction.amount_twd, moneyFormat(BASE_CURRENCY))}
                </p>
                {transaction.currency !== BASE_CURRENCY && (
                  <p className="text-xs text-muted-foreground">{format.number(transaction.amount, moneyFormat(transaction.currency))}</p>
                )}
              </div>
              <Button type="button" variant="ghost" className="size-10" aria-label={t("editNamed", { category: label })} onClick={() => setEditing(transaction)}>
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="size-10 text-destructive"
                disabled={pending}
                aria-label={t("deleteNamed", { category: label })}
                onClick={() => remove(transaction, label)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>
      {editing && <EditDialog transaction={editing} categories={props.categories} onClose={() => setEditing(null)} />}
    </>
  );
}
