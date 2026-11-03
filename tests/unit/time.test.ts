import { describe, expect, it } from "vitest";
import { isValidTimeZone, todayInTimeZone, wallClockInTimeZone } from "@/lib/time/today";

describe("todayInTimeZone", () => {
  it("rolls over exactly at 00:00 Taipei, which is 16:00 UTC the day before", () => {
    expect(todayInTimeZone("Asia/Taipei", new Date("2026-11-03T15:59:59Z"))).toBe("2026-11-03");
    expect(todayInTimeZone("Asia/Taipei", new Date("2026-11-03T16:00:00Z"))).toBe("2026-11-04");
  });

  it("differs from the UTC date when it should", () => {
    const now = new Date("2026-11-03T20:00:00Z");
    expect(now.toISOString().slice(0, 10)).toBe("2026-11-03");
    expect(todayInTimeZone("Asia/Taipei", now)).toBe("2026-11-04");
  });

  it("follows a changed timezone", () => {
    const now = new Date("2026-11-03T16:30:00Z");
    expect(todayInTimeZone("Asia/Taipei", now)).toBe("2026-11-04");
    expect(todayInTimeZone("Asia/Jakarta", now)).toBe("2026-11-03");
  });

  it("handles month and year boundaries", () => {
    expect(todayInTimeZone("Asia/Taipei", new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });
});

describe("wallClockInTimeZone", () => {
  it("gives the owner's local time with no offset", () => {
    expect(wallClockInTimeZone("Asia/Taipei", new Date("2026-11-03T01:30:05Z"))).toBe("2026-11-03T09:30:05");
  });

  it("writes midnight as 00:00 on the new date", () => {
    expect(wallClockInTimeZone("Asia/Taipei", new Date("2026-11-03T16:00:00Z"))).toBe("2026-11-04T00:00:00");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real zones and rejects anything else", () => {
    expect(isValidTimeZone("Asia/Taipei")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
