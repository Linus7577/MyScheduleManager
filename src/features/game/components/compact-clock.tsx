"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCountdown, secondsIntoDay, SECONDS_PER_DAY } from "../doom";
import { useWallClock } from "./use-wall-clock";

export function CompactClock({ timeZone }: { timeZone: string }) {
  const t = useTranslations("status");
  const wallClock = useWallClock(timeZone);
  const text = wallClock ? formatCountdown(SECONDS_PER_DAY - secondsIntoDay(wallClock)) : "--:--:--";

  return (
    <Link
      href="/doom"
      aria-label={t("doomClock")}
      className="ml-auto flex h-11 shrink-0 items-center rounded-lg px-1 font-mono text-sm text-crimson-400 tabular-nums hover:bg-surface-2"
    >
      {text}
    </Link>
  );
}
