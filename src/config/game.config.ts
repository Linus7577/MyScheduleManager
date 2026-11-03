// Phase 2 adds the XP, Power and tier formulas here. Every game number in the app lives in this file.
export const INITIAL_GAME_STATE = {
  tier: 1,
  level: 1,
  xpProgressPercent: 0,
  power: 100,
} as const;

export const POWER_MAX = 100;

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

export const REST_DAYS_PER_WEEK = 1;
export const SHIELDS_PER_MONTH = 3;
