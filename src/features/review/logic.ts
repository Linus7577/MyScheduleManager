import { CATEGORY_KEYS, isProductive, type Category } from "@/config/game.config";
import { earnedShare } from "@/features/command/logic";
import type { ProgressSnapshot } from "@/features/command/types";
import { countedMinutesFor } from "@/features/game/scoring";
import type { DailySummary, LedgerEntry } from "@/features/game/types";
import { addDays, datesBetween } from "@/features/schedule/logic";
import type { BlockInstance, RestDay } from "@/features/schedule/types";

export type CategoryRow = { category: Category; planned: number; done: number };

/** Minutes planned and earned for each productive category with anything planned, in the app's usual order. */
export function minutesByCategory(instances: BlockInstance[]): CategoryRow[] {
  const totals = new Map<Category, { planned: number; done: number }>();
  const dates = [...new Set(instances.map((block) => block.date))];
  for (const date of dates) {
    const day = instances.filter((block) => block.date === date && !block.is_cancelled);
    const counted = countedMinutesFor(day);
    for (const block of day) {
      if (!isProductive(block.category) || block.status === "rest") continue;
      const minutes = counted.get(block.id) ?? 0;
      const total = totals.get(block.category) ?? { planned: 0, done: 0 };
      total.planned += minutes;
      total.done += minutes * earnedShare(block.status);
      totals.set(block.category, total);
    }
  }
  return CATEGORY_KEYS.flatMap((category) => {
    const total = totals.get(category);
    return total ? [{ category, planned: total.planned, done: Math.round(total.done) }] : [];
  });
}

export type PowerDay = { date: string; power: number };

/**
 * Power at the end of each day so far, walked back from today's value through the ledger.
 * The ledger must reach from the first date to today, or the earlier days come out wrong.
 */
export function powerTrend(dates: string[], ledger: LedgerEntry[], currentPower: number, today: string): PowerDay[] {
  const after = (date: string) =>
    ledger.filter((entry) => entry.date > date).reduce((sum, entry) => sum + entry.delta_power, 0);
  return dates
    .filter((date) => date <= today)
    .map((date) => ({ date, power: Math.round(Math.min(Math.max(currentPower - after(date), 0), 100)) }));
}

export function ledgerTotals(ledger: LedgerEntry[], from: string, to: string) {
  let xpGained = 0;
  let xpLost = 0;
  let powerChange = 0;
  for (const entry of ledger) {
    if (entry.date < from || entry.date > to) continue;
    if (entry.delta_xp > 0) xpGained += entry.delta_xp;
    else xpLost -= entry.delta_xp;
    powerChange += entry.delta_power;
  }
  return { xpGained, xpLost, powerChange: Math.round(powerChange * 10) / 10 };
}

export function restCounts(days: RestDay[]) {
  return {
    restDays: days.filter((day) => day.kind === "rest").length,
    shields: days.filter((day) => day.kind === "shield").length,
  };
}

/** The streak as the week ended. A week still running shows today's. */
export function weekStreak(summaries: DailySummary[], weekEnd: string, today: string, currentStreak: number): number {
  if (weekEnd >= today) return currentStreak;
  const inWeek = summaries.filter((summary) => summary.date <= weekEnd).sort((a, b) => a.date.localeCompare(b.date));
  return inWeek.at(-1)?.streak_after ?? 0;
}

export type GoalProgress = { id: string; title: string; percent: number; change: number | null };

/** Where each goal ended the week, and how far it moved. `change` is null if nothing was recorded before the week. */
export function goalProgress(
  goals: { id: string; title: string; percent: number }[],
  snapshots: ProgressSnapshot[],
  weekStart: string,
  weekEnd: string,
  today: string
): GoalProgress[] {
  const latest = (id: string, onOrBefore: string) =>
    snapshots
      .filter((snapshot) => snapshot.entity_id === id && snapshot.date <= onOrBefore)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)?.percent ?? null;
  return goals.map((goal) => {
    const percent = weekEnd >= today ? goal.percent : (latest(goal.id, weekEnd) ?? goal.percent);
    const before = latest(goal.id, addDays(weekStart, -1));
    return { id: goal.id, title: goal.title, percent, change: before === null ? null : percent - before };
  });
}

export function weekRange(weekStart: string): { weekEnd: string; dates: string[] } {
  const weekEnd = addDays(weekStart, 6);
  return { weekEnd, dates: datesBetween(weekStart, weekEnd) };
}
