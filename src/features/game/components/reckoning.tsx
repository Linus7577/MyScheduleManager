"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Flame, ShieldAlert, Skull, Swords, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { dismissReckoningAction } from "../actions";
import type { ReckoningView } from "../service";

function Stat(props: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-3">
      {props.icon}
      <span className="text-sm text-muted-foreground">{props.label}</span>
      <span className="ml-auto text-base font-semibold tabular-nums">{props.value}</span>
    </div>
  );
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

export function Reckoning({ view }: { view: ReckoningView }) {
  const t = useTranslations("reckoning");
  const format = useFormatter();
  const { pending, error, run } = useScheduleAction();

  const formatDate = (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const period = view.days === 1 ? formatDate(view.lastDate) : `${formatDate(view.firstDate)} – ${formatDate(view.lastDate)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reckoning-title"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto bg-bg p-4"
    >
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="text-center">
          <p className="text-sm text-crimson-400">{period}</p>
          <h1 id="reckoning-title" className="mt-1 text-3xl font-semibold">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("flavor")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Stat icon={<Swords className="size-5 text-ember-400" aria-hidden="true" />} label={t("xpGained")} value={signed(view.xpGained)} />
          <Stat icon={<Skull className="size-5 text-crimson-400" aria-hidden="true" />} label={t("xpLost")} value={signed(-view.xpLost)} />
          <Stat icon={<Zap className="size-5 text-crimson-400" aria-hidden="true" />} label={t("power")} value={signed(view.powerChange)} />
          <Stat icon={<Skull className="size-5 text-ash-300" aria-hidden="true" />} label={t("blocksSkipped")} value={String(view.blocksSkipped)} />
          <Stat icon={<Flame className="size-5 text-ember-400" aria-hidden="true" />} label={t("streak")} value={t("streakDays", { count: view.streak })} />
        </div>

        {(view.armorFailing || view.collapsed || view.demoted) && (
          <div role="alert" className="flex flex-col gap-1 rounded-lg bg-crimson-950 p-3 text-sm text-crimson-100 ring-1 ring-crimson-700">
            {view.collapsed && <p>{t("collapsed")}</p>}
            {view.demoted && <p>{t("demoted")}</p>}
            {view.armorFailing && (
              <p className="flex items-center gap-2">
                <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
                {t("armorFailing")}
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="button" disabled={pending} className="h-12 text-base" onClick={() => run(() => dismissReckoningAction())}>
          {t("dismiss")}
        </Button>
      </div>
    </div>
  );
}
