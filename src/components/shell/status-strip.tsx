import { getTranslations } from "next-intl/server";
import { INITIAL_GAME_STATE, POWER_MAX } from "@/config/game.config";
import { cn } from "@/lib/utils";
import { RuneMark } from "./rune-mark";

function StatBar(props: { label: string; percent: number; barClass: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-xs text-muted-foreground">{props.label}</span>
      <div
        role="progressbar"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={props.percent}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={cn("h-full rounded-full", props.barClass)} style={{ width: `${props.percent}%` }} />
      </div>
    </div>
  );
}

/** Placeholder until Phase 2 connects the real game state and the Doom Clock. */
export async function StatusStrip() {
  const t = await getTranslations("status");
  const { level, power, xpProgressPercent } = INITIAL_GAME_STATE;

  return (
    <section
      aria-label={t("label")}
      className="sticky top-0 z-30 flex items-center gap-3 border-b bg-surface-1/95 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-8"
    >
      <div
        role="img"
        aria-label={t("portrait")}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2"
      >
        <RuneMark className="size-8" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 md:max-w-md">
        <p className="truncate text-xs font-medium">
          <span className="font-heading">{t("tierName")}</span>
          <span className="text-muted-foreground"> · {t("level", { level })}</span>
        </p>
        <StatBar label={t("xp")} percent={xpProgressPercent} barClass="bg-ember-500" />
        <StatBar label={t("power")} percent={(power / POWER_MAX) * 100} barClass="bg-crimson-500" />
      </div>
      <p aria-label={t("doomClock")} className="ml-auto shrink-0 font-mono text-sm text-muted-foreground tabular-nums">
        --:--:--
      </p>
    </section>
  );
}
