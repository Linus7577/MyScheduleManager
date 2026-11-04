import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIERS, WARRIOR_ART_BY_TIER, WARRIOR_EYES_BY_ART } from "@/config/game.config";
import { VOICE_SCRIPT } from "@/config/voice-lines";
import { firstLine, moodFor, nextBlock, pickLine, WARRIOR_LINES, type LineMood } from "@/features/game/lines";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));

describe("what he talks about", () => {
  const state = { powerState: "steady" as const, streakDays: 0, blocksToday: 2, blocksLeft: 1 };

  it("talks about a hurt warrior first", () => {
    expect(moodFor({ ...state, powerState: "broken", streakDays: 30 })).toBe("broken");
    expect(moodFor({ ...state, powerState: "wounded", blocksLeft: 0 })).toBe("wounded");
  });

  it("marks a finished day, but not a day with nothing planned", () => {
    expect(moodFor({ ...state, blocksLeft: 0 })).toBe("allDone");
    expect(moodFor({ ...state, blocksToday: 0, blocksLeft: 0 })).toBe("steady");
  });

  it("speaks of momentum on a streak or at full Power", () => {
    expect(moodFor({ ...state, streakDays: 3 })).toBe("rising");
    expect(moodFor({ ...state, streakDays: 2 })).toBe("steady");
    expect(moodFor({ ...state, powerState: "empowered" })).toBe("rising");
  });
});

describe("choosing a line", () => {
  it("never repeats the line he just said", () => {
    for (const mood of Object.keys(WARRIOR_LINES) as LineMood[]) {
      const lines = WARRIOR_LINES[mood];
      if (lines.length < 2) continue;
      for (let i = 0; i < 40; i++) expect(pickLine(mood, lines[0])).not.toBe(lines[0]);
    }
  });

  it("copes with a mood that has one line", () => {
    expect(pickLine("levelUp", "l1")).toBe("l1");
  });

  it("gives every line a chance", () => {
    expect(pickLine("steady", null, () => 0)).toBe("s1");
    expect(pickLine("steady", null, () => 0.999)).toBe("s4");
  });

  it("starts each day on one line, so the page renders the same everywhere", () => {
    expect(firstLine("steady", "2026-11-04")).toBe(firstLine("steady", "2026-11-04"));
    expect(WARRIOR_LINES.steady).toContain(firstLine("steady", "2026-11-31"));
  });
});

describe("the next battle", () => {
  const block = (title: string, start_time: string, end_time: string, status = "planned", is_cancelled = false) => ({
    title,
    start_time,
    end_time,
    status,
    is_cancelled,
  });

  it("finds a block running now before a later one", () => {
    const blocks = [block("Later", "15:00", "16:00"), block("Now", "09:00", "11:00")];
    expect(nextBlock(blocks, "10:00")?.title).toBe("Now");
  });

  it("finds the next one to start", () => {
    expect(nextBlock([block("Later", "15:00", "16:00")], "10:00")?.title).toBe("Later");
  });

  it("ignores what's finished, logged or cancelled", () => {
    const blocks = [
      block("Past", "07:00", "08:00"),
      block("Logged", "11:00", "12:00", "done"),
      block("Cancelled", "13:00", "14:00", "planned", true),
    ];
    expect(nextBlock(blocks, "10:00")).toBeNull();
  });

  it("doesn't count a block ending exactly now", () => {
    expect(nextBlock([block("Ended", "09:00", "10:00")], "10:00")).toBeNull();
  });
});

describe("his lines and art", () => {
  const ids = Object.values(WARRIOR_LINES).flat();

  it("has a Japanese line and both translations for every line", () => {
    const en = read("messages/en.json").warriorLines;
    const zh = read("messages/zh-TW.json").warriorLines;
    for (const id of ids) {
      expect(VOICE_SCRIPT[id], id).toMatch(/[぀-ヿ一-鿿]/);
      expect(en[id], id).toBeTruthy();
      expect(zh[id], id).toBeTruthy();
    }
    expect(Object.keys(en).sort()).toEqual([...ids].sort());
  });

  it("has art for every tier", () => {
    expect(WARRIOR_ART_BY_TIER).toHaveLength(TIERS.length);
    for (const art of WARRIOR_ART_BY_TIER) {
      expect(WARRIOR_EYES_BY_ART[art], `art ${art}`).toBeDefined();
      expect(readFileSync(`public/art/warrior/tier-${art}.webp`).length).toBeGreaterThan(1000);
      expect(readFileSync(`public/art/warrior/tier-${art}-face.webp`).length).toBeGreaterThan(500);
    }
  });

  it("keeps the art light enough for a phone", () => {
    for (const file of ["public/art/home/citadel.webp", "public/art/home/dragon.webp", "public/art/warrior/tier-6.webp"]) {
      expect(readFileSync(file).length, file).toBeLessThan(200 * 1024);
    }
  });
});
