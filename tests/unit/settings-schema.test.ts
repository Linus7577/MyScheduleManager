import { describe, expect, it } from "vitest";
import { settingsSchema } from "@/features/settings/schema";

describe("settingsSchema", () => {
  it("accepts valid settings", () => {
    expect(settingsSchema.safeParse({ locale: "zh-TW", timezone: "Asia/Taipei", motion: "full", about_me: "" }).success).toBe(true);
    expect(settingsSchema.safeParse({ locale: "en", timezone: "UTC", motion: "off", about_me: "A student" }).success).toBe(true);
  });

  it("rejects an unknown language or timezone", () => {
    expect(settingsSchema.safeParse({ locale: "fr", timezone: "Asia/Taipei", motion: "full", about_me: "" }).success).toBe(false);
    expect(settingsSchema.safeParse({ locale: "en", timezone: "Mars/Olympus", motion: "full", about_me: "" }).success).toBe(false);
    expect(settingsSchema.safeParse({ locale: "en", timezone: "UTC", motion: "wild", about_me: "" }).success).toBe(false);
    expect(settingsSchema.safeParse({ locale: "en", timezone: "UTC", motion: "full", about_me: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects missing values and extra fields", () => {
    expect(settingsSchema.safeParse({ locale: null, timezone: null, motion: null, about_me: null }).success).toBe(false);
    expect(settingsSchema.safeParse({ locale: "en", timezone: "UTC", motion: "full", about_me: "", user_id: "someone" }).success).toBe(false);
  });
});
