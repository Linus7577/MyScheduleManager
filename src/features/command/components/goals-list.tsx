"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { FIELD_CLASS } from "@/features/schedule/components/meta";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { createGoalAction, updateGoalAction } from "../actions";
import type { Goal, GoalFields, GoalStatus } from "../types";
import { ProgressBar } from "./progress-bar";

const STATUSES: GoalStatus[] = ["active", "paused", "done", "dropped"];

export function GoalDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const t = useTranslations("goals");
  const { pending, error, run } = useScheduleAction();
  const [values, setValues] = useState<GoalFields>(
    goal
      ? { title: goal.title, why: goal.why, target_date: goal.target_date, status: goal.status }
      : { title: "", why: "", target_date: null, status: "active" }
  );

  return (
    <FormDialog
      open
      onClose={onClose}
      title={goal ? t("editGoal") : t("newGoal")}
      pending={pending}
      error={error}
      onSubmit={() => run(() => (goal ? updateGoalAction({ id: goal.id, ...values }) : createGoalAction(values)), onClose)}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="goal-title">{t("goalTitle")}</Label>
        <Input id="goal-title" required maxLength={120} className="h-11" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="goal-why">{t("why")}</Label>
        <Textarea id="goal-why" rows={2} maxLength={2000} value={values.why} onChange={(e) => setValues({ ...values, why: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="goal-date">{t("targetDate")}</Label>
          <Input id="goal-date" type="date" className="h-11" value={values.target_date ?? ""} onChange={(e) => setValues({ ...values, target_date: e.target.value || null })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="goal-status">{t("status")}</Label>
          <select id="goal-status" className={FIELD_CLASS} value={values.status} onChange={(e) => setValues({ ...values, status: e.target.value as GoalStatus })}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`goalStatus.${status}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </FormDialog>
  );
}

export function GoalsList({ goals }: { goals: (Goal & { percent: number; projectCount: number })[] }) {
  const t = useTranslations("goals");
  const format = useFormatter();
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button type="button" className="h-11 gap-1.5 px-3" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t("newGoal")}
        </Button>
      </div>

      {goals.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-10 text-center text-base ring-1 ring-foreground/10">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((goal) => (
            <li key={goal.id}>
              <Link href={`/goals/${goal.id}`} className="glow-card flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-base font-medium break-words">{goal.title}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </span>
                <ProgressBar percent={goal.percent} label={t("progressOf", { title: goal.title })} />
                <span className="text-xs text-muted-foreground">
                  {t(`goalStatus.${goal.status}`)} · {t("projectCount", { count: goal.projectCount })}
                  {goal.target_date &&
                    ` · ${format.dateTime(new Date(`${goal.target_date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {adding && <GoalDialog goal={null} onClose={() => setAdding(false)} />}
    </div>
  );
}
