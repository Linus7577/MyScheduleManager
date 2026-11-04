"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { MotionLevel } from "@/config/app.config";
import { cn } from "@/lib/utils";
import { currentBlock, doomStatus, formatCountdown, secondsIntoDay, type DoomBlock } from "../doom";
import { DoomRings } from "./doom-rings";
import { ParticleCanvas } from "./particle-canvas";
import { useWallClock } from "./use-wall-clock";

const EMBER = "#ff6a2b";
const GOLD = "#d4af37";
const CALM_SPEED = 0.35;

export function DoomClock(props: { blocks: DoomBlock[]; today: string; timeZone: string; motion: MotionLevel }) {
  const t = useTranslations("doom");
  const router = useRouter();
  const wallClock = useWallClock(props.timeZone);
  const date = wallClock?.slice(0, 10);

  // When midnight passes, the page's blocks belong to yesterday.
  useEffect(() => {
    if (date && date !== props.today) router.refresh();
  }, [date, props.today, router]);

  const seconds = wallClock ? secondsIntoDay(wallClock) : 0;
  const status = doomStatus(props.blocks, seconds);
  const current = currentBlock(props.blocks, seconds);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-bg p-4 eclipse-sky">
      {status.isLastHour && <div aria-hidden="true" className="doom-vignette pointer-events-none absolute inset-0" />}
      <ParticleCanvas
        mode="inward"
        color={status.allDone ? GOLD : EMBER}
        motion={props.motion}
        speed={status.allDone ? CALM_SPEED : 1}
        className="pointer-events-none absolute inset-0 size-full"
      />

      <Link
        href="/"
        aria-label={t("close")}
        className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2"
      >
        <X className="size-5" aria-hidden="true" />
      </Link>

      <h1 className="sr-only">{t("title")}</h1>

      <div className="relative flex w-full max-w-md flex-col gap-4">
        <DoomRings currentHour={status.currentHour} blockProgress={current?.progress ?? null} allDone={status.allDone}>
          <p
            role="timer"
            aria-label={t("untilMidnight")}
            className={cn(
              "font-mono text-4xl font-semibold tabular-nums md:text-5xl",
              status.allDone ? "text-gold-300" : "text-bone"
            )}
          >
            {wallClock ? formatCountdown(status.secondsToMidnight) : "--:--:--"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("untilMidnight")}</p>
          {current && (
            <div className="mt-3 min-w-0">
              <p className="truncate text-sm font-medium">{current.block.title}</p>
              <p className="font-mono text-sm text-ember-400 tabular-nums">{formatCountdown(current.secondsLeft)}</p>
            </div>
          )}
        </DoomRings>

        <p role="status" className="min-h-6 text-center text-sm">
          {status.allDone && <span className="text-gold-300">{t("allDone")}</span>}
          {!status.allDone && status.isLastHour && (
            <span className="text-crimson-400">{t("lastHour", { count: status.openBlocks })}</span>
          )}
          {!status.allDone && !status.isLastHour && status.openBlocks > 0 && (
            <span className="text-muted-foreground">{t("remaining", { count: status.openBlocks })}</span>
          )}
        </p>
      </div>
    </div>
  );
}
