// Every game number in the app lives in this file.

/** A weight of 0 means no XP and no penalty: the block is a plain entry, not part of the game. */
export const CATEGORIES = {
  project_work: { weight: 1.2 },
  study: { weight: 1.0 },
  gym: { weight: 1.0 },
  reading: { weight: 0.8 },
  useful_youtube: { weight: 0.5, dailyMinutesCap: 60 },
  other: { weight: 0 },
} as const;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as [Category, ...Category[]];

export function isProductive(category: Category): boolean {
  return CATEGORIES[category].weight > 0;
}

export const USEFUL_YOUTUBE_DAILY_CAP = CATEGORIES.useful_youtube.dailyMinutesCap;

export const REST_DAYS_PER_WEEK = 1;
export const SHIELDS_PER_MONTH = 3;

/* XP */
export const COMPLETION = { done: 1, partial: 0.5, skipped: 0 } as const;
export const STREAK_BONUS_PER_DAY = 0.05;
export const STREAK_MULTIPLIER_MAX = 1.5;
export const LOSS_FACTOR_PER_TIER = 0.25;

/* Streak */
export const STREAK_THRESHOLD = 0.7;
export const STREAK_PARTIAL_WEIGHT = 0.5;

/* Power */
export const POWER_START = 100;
export const POWER_MIN = 0;
export const POWER_MAX = 100;
export const POWER_DONE_DIVISOR = 20;
export const POWER_PARTIAL_DIVISOR = 40;
export const POWER_SKIPPED_DIVISOR = 10;
export const COLLAPSE_AFTER_CLOSEOUTS = 3;

export const POWER_STATES = [
  { key: "empowered", min: 70 },
  { key: "steady", min: 40 },
  { key: "wounded", min: 15 },
  { key: "broken", min: 0 },
] as const;

export type PowerState = (typeof POWER_STATES)[number]["key"];

/* Levels and tiers */
export const LEVEL_XP_BASE = 50;
export const TIER_DEMOTION_AFTER_CLOSEOUTS = 3;

export const TIERS = [
  { tier: 1, level: 1 },
  { tier: 2, level: 8 },
  { tier: 3, level: 16 },
  { tier: 4, level: 25 },
  { tier: 5, level: 35 },
  { tier: 6, level: 45 },
  { tier: 7, level: 57 },
  { tier: 8, level: 70 },
] as const;

/* Corrections */
export const CORRECTION_WINDOW_HOURS = 24;

/* Avatar and effects */
export const AVATAR_EYE_Y_BY_TIER = [30, 30, 30, 29, 29, 28, 27, 26] as const;
export const PARTICLES = { desktop: 60, mobileFactor: 0.3 } as const;
