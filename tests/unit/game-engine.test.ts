import { describe, expect, it } from "vitest";
import { TIERS } from "@/config/game.config";
import {
  allocateCountedMinutes,
  clampPower,
  collapsedXp,
  dayCountsForStreak,
  levelForXp,
  levelProgressPercent,
  lossFactor,
  powerChange,
  powerStateFor,
  streakMultiplier,
  tierForLevel,
  xpEarned,
  xpForLevel,
  xpLost,
} from "@/features/game/engine";

// The worked examples are copied from SPEC.md section 7.4.
describe("worked examples from the spec", () => {
  it("7.4.1: 90 min Study, done, 4-day streak earns 108 XP", () => {
    expect(streakMultiplier(4)).toBeCloseTo(1.2);
    expect(xpEarned({ minutes: 90, category: "study", status: "done", streakDays: 4 })).toBe(108);
  });

  it("7.4.2: planned 300, done 180, partial 80 counts toward the streak", () => {
    expect(dayCountsForStreak({ plannedMinutes: 300, doneMinutes: 180, partialMinutes: 80 })).toBe(true);
  });

  it.each([
    [1, 15],
    [5, 75],
    [8, 120],
  ])("7.4.3: 60 min Study skipped at tier %i loses %i XP", (tier, expected) => {
    expect(xpLost({ minutes: 60, category: "study", tier })).toBe(expected);
  });

  it("7.4.4: Power 50, then 60 min done, then 60 min skipped ends at 47", () => {
    const afterDone = clampPower(50 + powerChange({ minutes: 60, category: "study", status: "done" }));
    expect(afterDone).toBe(53);
    expect(clampPower(afterDone + powerChange({ minutes: 60, category: "study", status: "skipped" }))).toBe(47);
  });

  it("7.4.5: 5,000 total XP is level 10", () => {
    expect(levelForXp(5000)).toBe(10);
  });

  it.each([
    [1, 1, 0],
    [2, 8, 3200],
    [3, 16, 12800],
    [4, 25, 31250],
    [5, 35, 61250],
    [6, 45, 101250],
    [7, 57, 162450],
    [8, 70, 245000],
  ])("7.4.6: tier %i is reached at level %i, %i XP", (tier, level, totalXp) => {
    expect(TIERS[tier - 1].level).toBe(level);
    if (tier > 1) expect(xpForLevel(level)).toBe(totalXp);
    expect(tierForLevel(levelForXp(totalXp))).toBe(tier);
  });

  it.each([
    [100, "empowered"],
    [70, "empowered"],
    [69, "steady"],
    [40, "steady"],
    [39, "wounded"],
    [15, "wounded"],
    [14, "broken"],
    [0, "broken"],
  ])("7.4.7: Power %i is %s", (power, state) => {
    expect(powerStateFor(power)).toBe(state);
  });
});

describe("XP", () => {
  it("partial earns half", () => {
    expect(xpEarned({ minutes: 60, category: "study", status: "partial", streakDays: 0 })).toBe(30);
  });

  it("skipped earns nothing", () => {
    expect(xpEarned({ minutes: 60, category: "study", status: "skipped", streakDays: 10 })).toBe(0);
  });

  it("uses each category's weight", () => {
    const earned = (category: Parameters<typeof xpEarned>[0]["category"]) =>
      xpEarned({ minutes: 100, category, status: "done", streakDays: 0 });
    expect(earned("project_work")).toBe(120);
    expect(earned("study")).toBe(100);
    expect(earned("gym")).toBe(100);
    expect(earned("reading")).toBe(80);
    expect(earned("useful_youtube")).toBe(50);
    expect(earned("other")).toBe(0);
  });

  it("rounds down", () => {
    expect(xpEarned({ minutes: 45, category: "reading", status: "partial", streakDays: 0 })).toBe(18);
  });

  it("isn't thrown off by floating point", () => {
    // 100 Ã— 1.2 Ã— 1.15 is exactly 138, but plain floating point arithmetic gives 137.99999999999997.
    expect(xpEarned({ minutes: 100, category: "project_work", status: "done", streakDays: 3 })).toBe(138);
  });
});

describe("streak multiplier", () => {
  it("starts at 1 and stops at 1.5", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(10)).toBe(1.5);
    expect(streakMultiplier(500)).toBe(1.5);
  });
});

describe("streak threshold", () => {
  it("is inclusive at exactly 70%", () => {
    expect(dayCountsForStreak({ plannedMinutes: 100, doneMinutes: 70, partialMinutes: 0 })).toBe(true);
    expect(dayCountsForStreak({ plannedMinutes: 100, doneMinutes: 69, partialMinutes: 0 })).toBe(false);
  });

  it("is neutral when nothing was planned", () => {
    expect(dayCountsForStreak({ plannedMinutes: 0, doneMinutes: 0, partialMinutes: 0 })).toBeNull();
  });
});

describe("losses", () => {
  it("scales from 0.25 to 2.0 by tier", () => {
    expect(lossFactor(1)).toBe(0.25);
    expect(lossFactor(8)).toBe(2);
  });

  it("costs nothing for 'other'", () => {
    expect(xpLost({ minutes: 600, category: "other", tier: 8 })).toBe(0);
  });
});

describe("Power", () => {
  it("clamps to 0 and 100", () => {
    expect(clampPower(120)).toBe(100);
    expect(clampPower(-5)).toBe(0);
  });

  it("gains half as much for partial", () => {
    expect(powerChange({ minutes: 60, category: "study", status: "partial" })).toBe(1.5);
  });

  it("ignores 'other' blocks", () => {
    expect(powerChange({ minutes: 600, category: "other", status: "skipped" })).toBe(0);
    expect(powerChange({ minutes: 600, category: "other", status: "done" })).toBe(0);
  });

  it("places fractional Power in the lower band", () => {
    expect(powerStateFor(69.5)).toBe("steady");
    expect(powerStateFor(39.9)).toBe("wounded");
    expect(powerStateFor(14.999)).toBe("broken");
  });
});

describe("levels", () => {
  it("never goes below 1", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(199)).toBe(1);
  });

  it("changes exactly at the threshold", () => {
    expect(levelForXp(199)).toBe(1);
    expect(levelForXp(200)).toBe(2);
    expect(levelForXp(3199)).toBe(7);
    expect(levelForXp(3200)).toBe(8);
  });

  it("reports progress through the level", () => {
    expect(levelProgressPercent(0)).toBe(0);
    expect(levelProgressPercent(100)).toBe(50);
    expect(levelProgressPercent(200)).toBe(0);
    expect(levelProgressPercent(325)).toBe(50);
  });

  it("gives the top tier at level 70 and beyond", () => {
    expect(tierForLevel(69)).toBe(7);
    expect(tierForLevel(70)).toBe(8);
    expect(tierForLevel(500)).toBe(8);
  });
});

describe("collapse", () => {
  it("drops to the threshold of the level below", () => {
    expect(collapsedXp(5100)).toBe(xpForLevel(9));
    expect(levelForXp(collapsedXp(5100))).toBe(9);
  });

  it("falls to 0 at level 1", () => {
    expect(collapsedXp(150)).toBe(0);
    expect(collapsedXp(0)).toBe(0);
  });
});

describe("Useful YouTube cap", () => {
  const video = (id: string, start_time: string, minutes: number, status = "planned") => ({
    id,
    start_time,
    minutes,
    status,
    category: "useful_youtube" as const,
  });

  it("counts only the first 60 minutes in a day", () => {
    const counted = allocateCountedMinutes([video("a", "09:00", 45), video("b", "10:00", 45)]);
    expect(counted.get("a")).toBe(45);
    expect(counted.get("b")).toBe(15);
  });

  it("gives minutes to watched videos before skipped ones", () => {
    const counted = allocateCountedMinutes([video("early", "09:00", 60, "skipped"), video("late", "10:00", 60, "done")]);
    expect(counted.get("late")).toBe(60);
    expect(counted.get("early")).toBe(0);
  });

  it("leaves other categories alone", () => {
    const counted = allocateCountedMinutes([
      { id: "study", start_time: "09:00", minutes: 300, status: "done", category: "study" },
      video("v", "10:00", 90),
    ]);
    expect(counted.get("study")).toBe(300);
    expect(counted.get("v")).toBe(60);
  });
});
