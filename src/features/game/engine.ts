import {
  CATEGORIES,
  COLLAPSE_AFTER_CLOSEOUTS,
  COMPLETION,
  isProductive,
  LEVEL_XP_BASE,
  LOSS_FACTOR_PER_TIER,
  POWER_DONE_DIVISOR,
  POWER_MAX,
  POWER_MIN,
  POWER_PARTIAL_DIVISOR,
  POWER_SKIPPED_DIVISOR,
  POWER_STATES,
  STREAK_BONUS_PER_DAY,
  STREAK_MULTIPLIER_MAX,
  STREAK_PARTIAL_WEIGHT,
  STREAK_THRESHOLD,
  TIER_DEMOTION_AFTER_CLOSEOUTS,
  TIERS,
  USEFUL_YOUTUBE_DAILY_CAP,
  type Category,
  type PowerState,
} from "@/config/game.config";

export { COLLAPSE_AFTER_CLOSEOUTS, TIER_DEMOTION_AFTER_CLOSEOUTS };

/** Power keeps three decimals, so repeated additions don't drift. */
export function roundPower(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** streakMult = min( 1 + 0.05 × streakDays, 1.5 ) */
export function streakMultiplier(streakDays: number): number {
  return Math.min(1 + STREAK_BONUS_PER_DAY * streakDays, STREAK_MULTIPLIER_MAX);
}

/** XP = floor( minutes × weight × completion × streakMult ), where done = 1.0, partial = 0.5, skipped = 0 */
export function xpEarned(input: {
  minutes: number;
  category: Category;
  status: keyof typeof COMPLETION;
  streakDays: number;
}): number {
  const raw =
    input.minutes * CATEGORIES[input.category].weight * COMPLETION[input.status] * streakMultiplier(input.streakDays);
  // Rounding first stops values like 108.00000000000001 or 107.99999999999999 falling on the wrong side of floor.
  return Math.floor(Math.round(raw * 1e6) / 1e6);
}

/** lossFactor(tier) = 0.25 × tier, so T1 = 0.25 … T8 = 2.0 */
export function lossFactor(tier: number): number {
  return LOSS_FACTOR_PER_TIER * tier;
}

/** XP lost = floor( minutes × weight × lossFactor(tier) ) */
export function xpLost(input: { minutes: number; category: Category; tier: number }): number {
  const raw = input.minutes * CATEGORIES[input.category].weight * lossFactor(input.tier);
  return Math.floor(Math.round(raw * 1e6) / 1e6);
}

/**
 * done: + minutes / 20, partial: + minutes / 40, skipped: − minutes / 10.
 * Categories with no weight ("other") don't touch Power, because they carry no penalty or reward.
 */
export function powerChange(input: { minutes: number; category: Category; status: "done" | "partial" | "skipped" }): number {
  if (!isProductive(input.category)) return 0;
  if (input.status === "done") return roundPower(input.minutes / POWER_DONE_DIVISOR);
  if (input.status === "partial") return roundPower(input.minutes / POWER_PARTIAL_DIVISOR);
  return roundPower(-input.minutes / POWER_SKIPPED_DIVISOR);
}

/** Clamps Power to [0, 100]. */
export function clampPower(power: number): number {
  return roundPower(Math.min(POWER_MAX, Math.max(POWER_MIN, power)));
}

/**
 * A day counts toward the streak if ( doneMinutes + 0.5 × partialMinutes ) ≥ 0.70 × plannedProductiveMinutes.
 * Returns null when nothing productive was planned: the day is neutral, like a Rest Day.
 */
export function dayCountsForStreak(input: {
  doneMinutes: number;
  partialMinutes: number;
  plannedMinutes: number;
}): boolean | null {
  if (input.plannedMinutes <= 0) return null;
  return input.doneMinutes + STREAK_PARTIAL_WEIGHT * input.partialMinutes >= STREAK_THRESHOLD * input.plannedMinutes;
}

/** XP needed for level L = 50 × L² */
export function xpForLevel(level: number): number {
  return LEVEL_XP_BASE * level * level;
}

/** level = max( 1, floor( sqrt( totalXP / 50 ) ) ) */
export function levelForXp(totalXp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(totalXp / LEVEL_XP_BASE)));
}

/** The highest tier whose required level has been reached. */
export function tierForLevel(level: number): number {
  let tier = 1;
  for (const entry of TIERS) {
    if (level >= entry.level) tier = entry.tier;
  }
  return tier;
}

export function tierRequiredLevel(tier: number): number {
  return TIERS[tier - 1].level;
}

/** How far through the current level, from 0 to 100. Level 1 starts at 0 XP, not at its threshold of 50. */
export function levelProgressPercent(totalXp: number): number {
  const level = levelForXp(totalXp);
  const start = level === 1 ? 0 : xpForLevel(level);
  const end = xpForLevel(level + 1);
  return Math.min(100, Math.max(0, ((totalXp - start) / (end - start)) * 100));
}

/** Empowered at 70–100, Steady at 40–69, Wounded at 15–39, Broken at 0–14. Decimals round down into the lower band. */
export function powerStateFor(power: number): PowerState {
  for (const state of POWER_STATES) {
    if (power >= state.min) return state.key;
  }
  return "broken";
}

/**
 * Collapse: total XP drops to the threshold of (current level − 1). Level 1 falls to 0.
 * Returns the new total XP.
 */
export function collapsedXp(totalXp: number): number {
  const level = levelForXp(totalXp);
  return level <= 1 ? 0 : xpForLevel(level - 1);
}

/**
 * Useful YouTube: only the first 60 minutes per day count, for XP, losses, Power and planned minutes.
 * Done and partial blocks claim those minutes first, in start order, then skipped ones, so skipping an early
 * video can't cancel the reward for watching a later one. Other categories count in full.
 */
export function allocateCountedMinutes<
  T extends { id: string; category: Category; status: string; minutes: number; start_time: string },
>(blocks: T[]): Map<string, number> {
  const counted = new Map<string, number>();
  const byStart = (a: T, b: T) => a.start_time.localeCompare(b.start_time);
  const videos = blocks.filter((block) => block.category === "useful_youtube");
  const earning = videos.filter((block) => block.status === "done" || block.status === "partial").sort(byStart);
  const rest = videos.filter((block) => block.status !== "done" && block.status !== "partial").sort(byStart);

  let remaining: number = USEFUL_YOUTUBE_DAILY_CAP;
  for (const block of [...earning, ...rest]) {
    const minutes = Math.min(block.minutes, remaining);
    counted.set(block.id, minutes);
    remaining -= minutes;
  }

  for (const block of blocks) {
    if (block.category !== "useful_youtube") counted.set(block.id, block.minutes);
  }
  return counted;
}
