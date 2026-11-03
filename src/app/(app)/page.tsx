import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Flame, ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/features/game/components/avatar";
import { ParticleCanvas } from "@/features/game/components/particle-canvas";
import { getGameView } from "@/features/game/service";
import { getScheduleContext } from "@/features/schedule/context";
import { getMotionLevel } from "@/features/settings/queries";
import { cn } from "@/lib/utils";

const POWER_INTENSITY = { empowered: 1, steady: 0.7, wounded: 0.35, broken: 0.15 } as const;
const EMBER = "#ff6a2b";

export default async function HomePage() {
  const t = await getTranslations("home");
  const tiers = await getTranslations("tiers");
  const powerStates = await getTranslations("powerStates");
  const format = await getFormatter();
  const ctx = await getScheduleContext();
  const [game, motion] = await Promise.all([getGameView(ctx), getMotionLevel()]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="sr-only">{t("title")}</h1>

      <section className="relative isolate overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div aria-hidden="true" className="fog-layer absolute inset-y-0 -inset-x-[10%] -z-10" />
        <ParticleCanvas
          mode="drift"
          color={EMBER}
          motion={motion}
          intensity={POWER_INTENSITY[game.powerState]}
          className="pointer-events-none absolute inset-0 -z-10 size-full"
        />
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <Avatar tier={game.tier} powerState={game.powerState} className="h-64 w-auto" />
          <div>
            <p className="font-heading text-2xl font-semibold">{tiers(String(game.tier))}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("levelLine", { level: game.level, state: powerStates(game.powerState) })}
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-sm">
            <Flame className="size-4 text-ember-400" aria-hidden="true" />
            {t("streak", { count: game.streakDays })}
          </p>
          {game.armorFailing && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-crimson-400">
              <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
              {t("armorFailing")}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {t("today")}:{" "}
            <time dateTime={ctx.today} className="text-foreground">
              {format.dateTime(new Date(`${ctx.today}T00:00:00Z`), { dateStyle: "full", timeZone: "UTC" })}
            </time>
          </p>
          <Link href="/loop" className={cn(buttonVariants(), "h-11 px-4")}>
            {t("openLoop")}
          </Link>
        </div>
      </section>
    </div>
  );
}
