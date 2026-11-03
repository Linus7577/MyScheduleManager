export const LOCALES = ["en", "zh-TW"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const DEFAULT_TIMEZONE = "Asia/Taipei";

export const MOTION_LEVELS = ["full", "reduced", "off"] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];
export const DEFAULT_MOTION: MotionLevel = "full";
export const MOTION_COOKIE = "motion";

export function isMotionLevel(value: unknown): value is MotionLevel {
  return typeof value === "string" && (MOTION_LEVELS as readonly string[]).includes(value);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
