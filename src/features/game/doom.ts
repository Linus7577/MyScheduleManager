import { isProductive, type Category } from "@/config/game.config";
import { toMinutes } from "@/features/schedule/logic";
import type { InstanceStatus } from "@/features/schedule/types";

export const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;
const LAST_HOUR = 23;

export type DoomBlock = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  category: Category;
  status: InstanceStatus;
};

/** Seconds since 00:00 from a wall-clock string like 2026-11-03T14:05:09. */
export function secondsIntoDay(wallClock: string): number {
  const [hours, minutes, seconds] = wallClock.slice(11, 19).split(":").map(Number);
  return hours * SECONDS_PER_HOUR + minutes * 60 + seconds;
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / SECONDS_PER_HOUR);
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

/** The block happening now. A block running past midnight lasts until midnight on its own date. */
export function currentBlock(blocks: DoomBlock[], seconds: number) {
  for (const block of blocks) {
    if (block.status === "rest") continue;
    const start = toMinutes(block.start_time) * 60;
    const rawEnd = toMinutes(block.end_time) * 60;
    const end = rawEnd <= start ? SECONDS_PER_DAY : rawEnd;
    if (seconds >= start && seconds < end) {
      return { block, progress: (seconds - start) / (end - start), secondsLeft: end - seconds };
    }
  }
  return null;
}

export function doomStatus(blocks: DoomBlock[], seconds: number) {
  const productive = blocks.filter((block) => isProductive(block.category) && block.status !== "rest");
  const open = productive.filter((block) => block.status === "planned").length;
  return {
    secondsToMidnight: SECONDS_PER_DAY - seconds,
    currentHour: Math.floor(seconds / SECONDS_PER_HOUR),
    openBlocks: open,
    isLastHour: seconds >= LAST_HOUR * SECONDS_PER_HOUR && open > 0,
    allDone: productive.length > 0 && productive.every((block) => block.status === "done"),
  };
}
