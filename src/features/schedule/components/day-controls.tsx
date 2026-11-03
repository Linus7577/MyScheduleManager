"use client";

import { useTranslations } from "next-intl";
import { Moon, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REST_DAYS_PER_WEEK, SHIELDS_PER_MONTH } from "@/config/game.config";
import { declareRestDayAction, declareShieldAction, undoRestDayAction } from "../actions";
import { canUndoRestDay } from "../logic";
import type { RestDay } from "../types";
import { useScheduleAction } from "./use-action";

export function DayControls(props: {
  date: string;
  today: string;
  restDay: RestDay | null;
  restDaysUsed: number;
  shieldsUsed: number;
}) {
  const t = useTranslations("restDays");
  const { pending, error, run } = useScheduleAction();
  const { date, today, restDay } = props;

  return (
    <section aria-label={t("label")} className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      {restDay ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm">
            {restDay.kind === "rest" ? (
              <Moon className="size-4 text-ash-300" aria-hidden="true" />
            ) : (
              <Shield className="size-4 text-ember-400" aria-hidden="true" />
            )}
            {restDay.kind === "rest" ? t("isRestDay") : t("isShield")}
          </p>
          {canUndoRestDay(restDay, today) && (
            <Button
              type="button"
              variant="outline"
              className="h-10 px-3"
              disabled={pending}
              onClick={() => run(() => undoRestDayAction({ date }))}
            >
              {t("undo")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-1.5 px-1"
            disabled={pending || date <= today || props.restDaysUsed >= REST_DAYS_PER_WEEK}
            onClick={() => run(() => declareRestDayAction({ date }))}
          >
            <Moon className="size-4" aria-hidden="true" />
            {t("declareRest")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-1.5 px-1"
            disabled={pending || date < today || props.shieldsUsed >= SHIELDS_PER_MONTH}
            onClick={() => run(() => declareShieldAction({ date }))}
          >
            <Shield className="size-4" aria-hidden="true" />
            {t("declareShield")}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t("usage", {
          rest: props.restDaysUsed,
          restLimit: REST_DAYS_PER_WEEK,
          shields: props.shieldsUsed,
          shieldLimit: SHIELDS_PER_MONTH,
        })}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
