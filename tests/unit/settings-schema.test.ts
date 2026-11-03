import { describe, expect, it } from "vitest";
import { settingsSchema } from "@/features/settings/schema";

describe("settingsSchema", () => {
  it("accepts valid settings", () => {
    expect(settingsSchema.safeParse({ locale: "zh-TW", timezone: "Asia/Taipei", motion: "full" }).success).toBe(true);
    expect(settingsSchema.safeParse({ locale: "en", timezone: "UTC", motion: "off" }).success).toBe(true);
  });

  it("rejects an unknown language or timezone", () => {
    expect(settingsSchema.safeParse({ locale: "fr", timezone: "Asia/Taipei", motion: "full" }).success).toBe(false);
    expect(settingsSchema.safeParse({ locale: "en", timezone: "Mars/Olympus", motion: "full" }).success).toBe(false);
    expect(settingsSchema.safeParse({ locale: "en", timezone: "UTC", motion: "wild" }).success).toBe(false);
  });

  it("rejects missing values and extra fields", () => {
    expect(settingsSchema.safeParse({ locale: null, timezone: null, motion: null }).success).toBe(false);
    expect(settingsSchema.safeParse({ locale: "en", timezone: "UTC", motion: "full", user_id: "someone" }).success).toBe(false);
  });
});
