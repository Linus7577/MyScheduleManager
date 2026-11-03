import { describe, expect, it } from "vitest";
import { currentBlock, doomStatus, formatCountdown, secondsIntoDay, type DoomBlock } from "@/features/game/doom";

const block = (patch: Partial<DoomBlock> = {}): DoomBlock => ({
  id: "b",
  title: "Study",
  start_time: "09:00",
  end_time: "10:00",
  category: "study",
  status: "planned",
  ...patch,
});

describe("countdown", () => {
  it("reads the clock", () => {
    expect(secondsIntoDay("2026-11-03T00:00:00")).toBe(0);
    expect(secondsIntoDay("2026-11-03T14:05:09")).toBe(50709);
    expect(secondsIntoDay("2026-11-03T23:59:59")).toBe(86399);
  });

  it("formats hours, minutes and seconds", () => {
    expect(formatCountdown(86400)).toBe("24:00:00");
    expect(formatCountdown(3661)).toBe("01:01:01");
    expect(formatCountdown(1)).toBe("00:00:01");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });

  it("reaches one second left just before midnight", () => {
    expect(doomStatus([], secondsIntoDay("2026-11-03T23:59:59")).secondsToMidnight).toBe(1);
  });

  it("starts a full day at midnight", () => {
    const status = doomStatus([], 0);
    expect(status.secondsToMidnight).toBe(86400);
    expect(status.currentHour).toBe(0);
  });
});

describe("currentBlock", () => {
  it("finds the block in progress, with its progress and time left", () => {
    const found = currentBlock([block()], 9 * 3600 + 30 * 60);
    expect(found?.progress).toBe(0.5);
    expect(found?.secondsLeft).toBe(1800);
  });

  it("includes the start and excludes the end", () => {
    expect(currentBlock([block()], 9 * 3600)).not.toBeNull();
    expect(currentBlock([block()], 10 * 3600)).toBeNull();
  });

  it("treats a past-midnight block as lasting until midnight today", () => {
    const late = block({ start_time: "23:00", end_time: "01:00" });
    expect(currentBlock([late], 23 * 3600 + 1800)?.secondsLeft).toBe(1800);
    expect(currentBlock([late], 1800)).toBeNull();
  });

  it("ignores rest blocks", () => {
    expect(currentBlock([block({ status: "rest" })], 9 * 3600 + 60)).toBeNull();
  });
});

describe("doomStatus", () => {
  it("raises the alarm only in the last hour with blocks still open", () => {
    expect(doomStatus([block()], 22 * 3600 + 3599).isLastHour).toBe(false);
    expect(doomStatus([block()], 23 * 3600).isLastHour).toBe(true);
    expect(doomStatus([block({ status: "done" })], 23 * 3600).isLastHour).toBe(false);
  });

  it("counts open productive blocks only", () => {
    const status = doomStatus(
      [block(), block({ id: "c", status: "done" }), block({ id: "d", category: "other" }), block({ id: "e", status: "rest" })],
      0
    );
    expect(status.openBlocks).toBe(1);
  });

  it("is all done only when every productive block is done", () => {
    expect(doomStatus([block({ status: "done" })], 0).allDone).toBe(true);
    expect(doomStatus([block({ status: "done" }), block({ id: "x", status: "partial" })], 0).allDone).toBe(false);
    expect(doomStatus([block({ status: "done" }), block({ id: "x", category: "other" })], 0).allDone).toBe(true);
    expect(doomStatus([], 0).allDone).toBe(false);
  });
});
