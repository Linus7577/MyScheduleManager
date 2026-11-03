import { z } from "zod";
import { LOCALES, MOTION_LEVELS } from "@/config/app.config";
import { isValidTimeZone } from "@/lib/time/today";

export const settingsSchema = z.strictObject({
  locale: z.enum(LOCALES),
  timezone: z.string().min(1).max(64).refine(isValidTimeZone),
  motion: z.enum(MOTION_LEVELS),
  about_me: z.string().trim().max(2000),
});

export type SaveSettingsStatus = "idle" | "saved" | "savedPreview" | "invalid" | "failed";
export type SaveSettingsState = { status: SaveSettingsStatus };
