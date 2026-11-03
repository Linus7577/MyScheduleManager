// Phase 0 only needs the starting state for the status strip placeholder. Phase 2 adds the full game constants here.
export const INITIAL_GAME_STATE = {
  tier: 1,
  level: 1,
  xpProgressPercent: 0,
  power: 100,
} as const;

export const POWER_MAX = 100;
