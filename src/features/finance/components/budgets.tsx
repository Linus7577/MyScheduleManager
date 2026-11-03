"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, Pencil, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { deleteBudgetAction, setBudgetAction } from "../actions";
import type { BudgetLevel, BudgetStatus, FinCategory } from "../types";
import { categoryLabel, moneyFormat } from "./format";

const LEVEL_ICON = { ok: CircleCheck, warning: TriangleAlert, over: CircleAlert };
const LEVEL_BAR: Record<BudgetLevel, string> = { ok: "bg-ash-300", warning: "bg-ember-400", over: "bg-crimson-400" };

function BudgetDialog(props: { category: FinCategory; name: string; status: BudgetStatus | undefined; onClose: () => void }) {
  const t = useTranslations("finance");
  const { pending, error, run } = useScheduleAction();
  const [amount, setAmount] = useState(props.status ? String(props.status.amount_twd) : "");

  return (
    <FormDialog
      open
      onClose={props.onClose}
      title={t("budgetFor", { category: props.name })}
      pending={pending}
      error={error}
      onSubmit={() => run(() => setBudgetAction({ category_id: props.category.id, amount_twd: Number(amount) }), props.onClose)}
      extraAction={
        props.status ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="h-11 px-2 text-destructive"
            onClick={() => run(() => deleteBudgetAction({ category_id: props.category.id }), props.onClose)}
          >
            {t("removeBudget")}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="budget-amount">{t("monthlyBudget")}</Label>
        <Input id="budget-amount" type="number" inputMode="decimal" step="0.01" min="1" required className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
    </FormDialog>
  );
}

export function BudgetsPage(props: { categories: FinCategory[]; statuses: BudgetStatus[] }) {
  const t = useTranslations("finance");
  const names = useTranslations("financeCategories");
  const format = useFormatter();
  const [editing, setEditing] = useState<FinCategory | null>(null);
  const money = (value: number) => format.number(value, moneyFormat("TWD"));

  const editingName = editing ? categoryLabel(editing, (key) => names(key)) : "";

  return (
    <>
      <ul className="flex flex-col divide-y rounded-xl bg-card px-4 ring-1 ring-foreground/10">
        {props.categories.map((category) => {
          const label = categoryLabel(category, (key) => names(key));
          const status = props.statuses.find((row) => row.category_id === category.id);
          const Icon = status && LEVEL_ICON[status.level];
          return (
            <li key={category.id} className="flex items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">{label}</p>
                {status && Icon ? (
                  <>
                    <div
                      role="progressbar"
                      aria-label={t("budgetUsed", { category: label })}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(status.percent, 100)}
                      aria-valuetext={`${status.percent}%`}
                      className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"
                    >
                      <div className={`h-full rounded-full ${LEVEL_BAR[status.level]}`} style={{ width: `${Math.min(status.percent, 100)}%` }} />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
                      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                      {t(`budgetLevel.${status.level}`)}
                      <span>· {t("budgetProgress", { spent: money(status.spent_twd), budget: money(status.amount_twd), percent: status.percent })}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("noBudget")}</p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-1.5 px-3"
                aria-label={t(status ? "editBudgetNamed" : "setBudgetNamed", { category: label })}
                onClick={() => setEditing(category)}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                {t(status ? "editBudget" : "setBudget")}
              </Button>
            </li>
          );
        })}
      </ul>
      {editing && (
        <BudgetDialog
          category={editing}
          name={editingName}
          status={props.statuses.find((row) => row.category_id === editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
