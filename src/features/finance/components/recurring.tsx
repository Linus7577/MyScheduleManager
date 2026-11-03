"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BASE_CURRENCY, CURRENCIES, type Currency } from "@/config/finance.config";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { FIELD_CLASS } from "@/features/schedule/components/meta";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { createRecurringAction, deleteRecurringAction, setRecurringActiveAction, updateRecurringAction } from "../actions";
import type { FinCategory, RecurringFrequency, RecurringRule, TransactionKind } from "../types";
import { categoryLabel, moneyFormat, toUtcDate } from "./format";

const FREQUENCIES: RecurringFrequency[] = ["weekly", "monthly", "yearly"];

function RuleDialog(props: { rule: RecurringRule | null; categories: FinCategory[]; today: string; onClose: () => void }) {
  const t = useTranslations("finance");
  const names = useTranslations("financeCategories");
  const { pending, error, run } = useScheduleAction();
  const { rule } = props;

  const [kind, setKind] = useState<TransactionKind>(rule?.kind ?? "expense");
  const [amount, setAmount] = useState(rule ? String(rule.amount) : "");
  const [currency, setCurrency] = useState<Currency>(rule?.currency ?? BASE_CURRENCY);
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? "monthly");
  const [startDate, setStartDate] = useState(rule?.start_date ?? props.today);
  const [endDate, setEndDate] = useState(rule?.end_date ?? "");
  const [note, setNote] = useState(rule?.note ?? "");
  const [payment, setPayment] = useState(rule?.payment_method ?? "");

  const choices = props.categories.filter(
    (category) => category.kind === kind && (!category.archived || category.id === rule?.category_id)
  );
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? choices[0]?.id ?? "");

  function changeKind(next: TransactionKind) {
    setKind(next);
    setCategoryId(props.categories.find((category) => category.kind === next && !category.archived)?.id ?? "");
  }

  function save() {
    const fields = {
      kind,
      amount: Number(amount),
      currency,
      category_id: categoryId,
      note,
      payment_method: payment,
      end_date: endDate || null,
    };
    run(
      () =>
        rule
          ? updateRecurringAction({ id: rule.id, ...fields })
          : createRecurringAction({ ...fields, frequency, start_date: startDate }),
      props.onClose
    );
  }

  return (
    <FormDialog open onClose={props.onClose} title={rule ? t("editRule") : t("newRule")} pending={pending} error={error} onSubmit={save}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rule-kind">{t("kindLabel")}</Label>
        <select id="rule-kind" className={FIELD_CLASS} value={kind} onChange={(e) => changeKind(e.target.value as TransactionKind)}>
          <option value="expense">{t("expense")}</option>
          <option value="income">{t("income")}</option>
        </select>
      </div>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="rule-amount">{t("amount")}</Label>
          <Input id="rule-amount" type="number" inputMode="decimal" step="0.01" min="0.01" required className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex w-24 flex-col gap-2">
          <Label htmlFor="rule-currency">{t("currency")}</Label>
          <select id="rule-currency" className={FIELD_CLASS} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rule-category">{t("category")}</Label>
        <select id="rule-category" className={FIELD_CLASS} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {choices.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryLabel(category, (key) => names(key))}
            </option>
          ))}
        </select>
      </div>
      {!rule && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rule-frequency">{t("frequency")}</Label>
            <select id="rule-frequency" className={FIELD_CLASS} value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
              {FREQUENCIES.map((option) => (
                <option key={option} value={option}>
                  {t(`frequencies.${option}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rule-start">{t("startDate")}</Label>
            <Input id="rule-start" type="date" required className="h-11" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="rule-end">{t("endDate")}</Label>
        <Input id="rule-end" type="date" className="h-11" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rule-note">{t("note")}</Label>
        <Input id="rule-note" maxLength={500} className="h-11" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rule-payment">{t("paymentMethod")}</Label>
        <Input id="rule-payment" maxLength={40} className="h-11" value={payment} onChange={(e) => setPayment(e.target.value)} />
      </div>
      {!rule && <p className="text-xs text-muted-foreground">{t("ruleBackfillHint")}</p>}
    </FormDialog>
  );
}

export function RecurringPage(props: { rules: RecurringRule[]; categories: FinCategory[]; today: string }) {
  const t = useTranslations("finance");
  const names = useTranslations("financeCategories");
  const format = useFormatter();
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<{ rule: RecurringRule | null } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" className="h-11 w-fit gap-1.5 px-4" onClick={() => setDialog({ rule: null })}>
        <Plus className="size-4" aria-hidden="true" />
        {t("newRule")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {props.rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noRules")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl bg-card px-4 ring-1 ring-foreground/10">
          {props.rules.map((rule) => {
            const label = categoryLabel(
              props.categories.find((category) => category.id === rule.category_id),
              (key) => names(key)
            );
            const finished = rule.end_date !== null && rule.next_date > rule.end_date;
            return (
              <li key={rule.id} className="flex items-center gap-1 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">
                    {label}
                    {rule.note && ` · ${rule.note}`}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {format.number(rule.amount, moneyFormat(rule.currency))} · {t(`frequencies.${rule.frequency}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {!rule.active
                      ? t("rulePaused")
                      : finished
                        ? t("ruleFinished")
                        : t("ruleNext", { date: format.dateTime(toUtcDate(rule.next_date), { dateStyle: "medium", timeZone: "UTC" }) })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-10"
                  disabled={pending}
                  aria-label={t(rule.active ? "pauseNamed" : "resumeNamed", { category: label })}
                  onClick={() => run(() => setRecurringActiveAction({ id: rule.id, active: !rule.active }))}
                >
                  {rule.active ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                </Button>
                <Button type="button" variant="ghost" className="size-10" aria-label={t("editRuleNamed", { category: label })} onClick={() => setDialog({ rule })}>
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-10 text-destructive"
                  disabled={pending}
                  aria-label={t("deleteRuleNamed", { category: label })}
                  onClick={() => {
                    if (window.confirm(t("deleteRuleConfirm", { category: label }))) run(() => deleteRecurringAction({ id: rule.id }));
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {dialog && <RuleDialog rule={dialog.rule} categories={props.categories} today={props.today} onClose={() => setDialog(null)} />}
    </div>
  );
}
