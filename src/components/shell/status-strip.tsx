import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { POWER_MAX } from "@/config/game.config";
import { Avatar } from "@/features/game/components/avatar";
import { CompactClock } from "@/features/game/components/compact-clock";
import type { GameView } from "@/features/game/service";
import { cn } from "@/lib/utils";

function StatBar(props: { label: string; percent: number; barClass: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-xs text-muted-foreground">{props.label}</span>
      <div
        role="progressbar"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(props.percent)}
        aria-valuetext={props.text}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={cn("h-full rounded-full", props.barClass)} style={{ width: `${props.percent}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{props.text}</span>
    </div>
  );
}

export async function StatusStrip({ game, timeZone }: { game: GameView; timeZone: string }) {
  const t = await getTranslations("status");
  const tiers = await getTranslations("tiers");
  const power = Math.floor(game.power);

  return (
    <section
      aria-label={t("label")}
      className="sticky top-0 z-30 flex items-center gap-3 border-b bg-surface-1/95 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-8"
    >
      <div
        role="img"
        aria-label={t("portrait")}
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2"
      >
        <Avatar tier={game.tier} powerState={game.powerState} portrait className="size-10" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 md:max-w-md">
        <p className="flex items-center gap-1 truncate text-xs font-medium">
          <span className="truncate font-heading">{tiers(String(game.tier))}</span>
          <span className="shrink-0 text-muted-foreground">· {t("level", { level: game.level })}</span>
          {game.armorFailing && (
            <ShieldAlert className="size-3.5 shrink-0 text-crimson-400" role="img" aria-label={t("armorFailing")} />
          )}
        </p>
        <StatBar
          label={t("xp")}
          percent={game.xpProgressPercent}
          barClass="bg-ember-500"
          text={game.totalXp.toLocaleString("en-US")}
        />
        <StatBar label={t("power")} percent={(game.power / POWER_MAX) * 100} barClass="bg-crimson-500" text={String(power)} />
      </div>
      <CompactClock timeZone={timeZone} />
    </section>
  );
}
