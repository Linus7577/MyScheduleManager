import { beforeEach, describe, expect, it } from "vitest";
import * as game from "@/features/game/service";
import { computeCloseout, replayLedger, replayStreaks } from "@/features/game/scoring";
import type { DailySummary, GameValues } from "@/features/game/types";
import { createMemoryRepo } from "@/features/schedule/memory-repo";
import type { AppRepo } from "@/features/schedule/generation";
import * as schedule from "@/features/schedule/service";
import type { BlockFields, BlockInstance } from "@/features/schedule/types";

// 2026-11-03 is a Tuesday.
const MON = "2026-11-02";
const TUE = "2026-11-03";
const WED = "2026-11-04";
const THU = "2026-11-05";
const FRI = "2026-11-06";

const study = (patch: Partial<BlockFields> = {}): BlockFields => ({
  start_time: "09:00",
  end_time: "10:00",
  category: "study",
  title: "Study",
  notes: "",
  ...patch,
});

let repo: AppRepo;
let templateId: string;

const at = (today: string, hoursAfterMidnight = 12): schedule.ScheduleContext => ({
  repo,
  today,
  now: new Date(`${today}T${String(hoursAfterMidnight).padStart(2, "0")}:00:00Z`),
});

const dayOf = async (date: string) => (await repo.listInstances(date, date)).filter((block) => !block.is_cancelled);

async function addBlock(weekday: number, patch: Partial<BlockFields> = {}) {
  await schedule.createBlock(at(MON), { template_id: templateId, weekday, ...study(patch) });
}

async function log(date: string, status: "done" | "partial" | "skipped" | "planned", title = "Study", ctxDate = date) {
  const block = (await dayOf(date)).find((candidate) => candidate.title === title);
  if (!block) throw new Error(`No block ${title} on ${date}`);
  return game.logBlock(at(ctxDate), block.id, status, "");
}

const state = async () => (await repo.getGameState())!;

beforeEach(async () => {
  repo = createMemoryRepo();
  await schedule.ensureLoopReady(at(MON), ["Semester", "Exam Week", "Holiday"]);
  templateId = (await repo.listTemplates())[0].id;
});

describe("checking off", () => {
  it("earns XP and Power as soon as a block is done", async () => {
    await addBlock(1, { start_time: "09:00", end_time: "10:30" });
    await log(MON, "done");

    const current = await state();
    expect(current.total_xp).toBe(90);
    // Power starts at 100, so a gain at the cap adds nothing.
    expect(current.power).toBe(100);
    expect((await repo.listAllLedger()).map((entry) => entry.source)).toEqual(["block"]);
  });

  it("uses the current streak", async () => {
    await repo.createGameState();
    const before = await state();
    await repo.commitGame({
      expected_version: before.version,
      close_date: null,
      instances: [],
      ledger: [],
      state: { ...before, streak_days: 4 },
      summaries: [],
      audit: [],
    });
    await addBlock(1, { start_time: "09:00", end_time: "10:30" });
    await log(MON, "done");
    expect((await state()).total_xp).toBe(108);
  });

  it("adjusts when changed, by adding rows rather than editing history", async () => {
    await addBlock(1);
    await log(MON, "done");
    expect((await state()).total_xp).toBe(60);

    await log(MON, "partial");
    expect((await state()).total_xp).toBe(30);

    await log(MON, "planned");
    expect((await state()).total_xp).toBe(0);

    const ledger = await repo.listAllLedger();
    expect(ledger.map((entry) => entry.delta_xp)).toEqual([60, -30, -30]);
  });

  it("charges nothing for skipped until closeout", async () => {
    await addBlock(1);
    await log(MON, "skipped");
    expect((await state()).total_xp).toBe(0);
    expect((await state()).power).toBe(100);
  });

  it("gives 'other' blocks no XP and no Power", async () => {
    await addBlock(1, { category: "other", title: "Lunch" });
    await log(MON, "done", "Lunch");
    expect((await state()).total_xp).toBe(0);
    expect(await repo.listAllLedger()).toEqual([]);
  });

  it("logging the same status twice changes nothing", async () => {
    await addBlock(1);
    await log(MON, "done");
    await log(MON, "done");
    expect((await state()).total_xp).toBe(60);
    expect(await repo.listAllLedger()).toHaveLength(1);
  });

  it("only counts the first 60 minutes of Useful YouTube across the day", async () => {
    await addBlock(1, { category: "useful_youtube", title: "Video A", start_time: "09:00", end_time: "09:45" });
    await addBlock(1, { category: "useful_youtube", title: "Video B", start_time: "10:00", end_time: "10:45" });

    await log(MON, "done", "Video A");
    await log(MON, "done", "Video B");
    // 60 counted minutes Ã— 0.5 weight, split as 22 + 7.
    expect((await state()).total_xp).toBe(22 + 7);
  });

  it("re-scores a logged block when its length changes", async () => {
    await addBlock(1);
    await log(MON, "done");
    const [block] = await dayOf(MON);

    await schedule.editInstance(at(MON), block.id, study({ end_time: "11:00" }), false);
    expect((await state()).total_xp).toBe(120);
  });

  it("takes XP back when a productive event's block goes away", async () => {
    const event = {
      title: "Library",
      notes: "",
      category: "study" as const,
      all_day: false,
      start_date: MON,
      end_date: MON,
      start_time: "14:00",
      end_time: "15:00",
    };
    await schedule.createEvent(at(MON), event);
    await log(MON, "done", "Library");
    expect((await state()).total_xp).toBe(60);

    const [created] = await repo.listEvents(MON, MON);
    await schedule.deleteEvent(at(MON), created.id);
    expect((await state()).total_xp).toBe(0);
    expect(await game.verifyStateMatchesLedger(at(MON))).toBe(true);
  });
});

describe("closeout", () => {
  it("marks unlogged blocks skipped and applies the loss", async () => {
    await repo.createGameState();
    await addBlock(1, { title: "Earned", start_time: "08:00", end_time: "12:00" });
    await addBlock(1);
    await log(MON, "done", "Earned");
    expect((await state()).total_xp).toBe(240);

    expect(await game.runPendingCloseouts(at(TUE))).toBe(1);

    const blocks = await dayOf(MON);
    expect(blocks.find((block) => block.title === "Study")?.status).toBe("skipped");
    // Tier 1: 60 Ã— 1.0 Ã— 0.25 = 15 lost. Power: 100 âˆ’ 60 / 10 = 94.
    const current = await state();
    expect(current.total_xp).toBe(225);
    expect(current.power).toBe(94);
    expect(current.last_closed_date).toBe(MON);
  });

  it("is safe to run twice", async () => {
    await addBlock(1);
    await game.runPendingCloseouts(at(TUE));
    const first = await state();
    const ledgerSize = (await repo.listAllLedger()).length;

    expect(await game.runPendingCloseouts(at(TUE))).toBe(0);

    expect(await state()).toEqual(first);
    expect(await repo.listAllLedger()).toHaveLength(ledgerSize);
    expect(await repo.listSummariesFrom(MON)).toHaveLength(1);
  });

  it("refuses to close the same day twice even if the state check is passed", async () => {
    await addBlock(1);
    await game.runPendingCloseouts(at(TUE));
    const current = await state();
    const result = await repo.commitGame({
      expected_version: current.version,
      close_date: MON,
      instances: [],
      ledger: [],
      state: current,
      summaries: [],
      audit: [],
    });
    expect(result).toBe(false);
  });

  it("closes several missed days in date order, including days never opened", async () => {
    await addBlock(1);
    await addBlock(2);
    await addBlock(3);
    expect(await game.runPendingCloseouts(at(THU))).toBe(3);
    expect((await state()).last_closed_date).toBe(WED);
    expect((await repo.listAllLedger()).map((entry) => entry.date)).toEqual([MON, TUE, WED]);
  });

  it("doesn't close today", async () => {
    await addBlock(1);
    expect(await game.runPendingCloseouts(at(MON))).toBe(0);
    expect((await dayOf(MON))[0].status).toBe("planned");
  });

  it("does nothing before there's anything to close", async () => {
    expect(await game.runPendingCloseouts(at(TUE))).toBe(0);
    expect((await state()).last_closed_date).toBeNull();
  });

  it("waits for a block running past midnight", async () => {
    await addBlock(1, { start_time: "23:00", end_time: "01:00" });

    const during = { ...at(TUE), wallClock: `${TUE}T00:30:00` };
    expect(await game.runPendingCloseouts(during)).toBe(0);
    expect((await dayOf(MON))[0].status).toBe("planned");

    const after = { ...at(TUE), wallClock: `${TUE}T01:30:00` };
    expect(await game.runPendingCloseouts(after)).toBe(1);
    expect((await dayOf(MON))[0].status).toBe("skipped");
  });

  it("charges an owner-marked skip too", async () => {
    await addBlock(1);
    await log(MON, "skipped");
    await game.runPendingCloseouts(at(TUE));
    expect((await state()).power).toBe(94);
  });

  it("never takes XP below 0", async () => {
    await addBlock(1, { start_time: "08:00", end_time: "20:00" });
    await game.runPendingCloseouts(at(TUE));
    expect((await state()).total_xp).toBe(0);
    expect(await game.verifyStateMatchesLedger(at(TUE))).toBe(true);
  });

  it("leaves 'other' blocks out of it", async () => {
    await addBlock(1, { category: "other", title: "Lunch" });
    await game.runPendingCloseouts(at(TUE));
    expect((await state()).power).toBe(100);
    expect((await dayOf(MON))[0].status).toBe("planned");
    expect((await repo.getSummary(MON))?.day_type).toBe("empty");
  });

  it("records what was skipped in the summary", async () => {
    await addBlock(1);
    await game.runPendingCloseouts(at(TUE));
    const summary = await repo.getSummary(MON);
    expect(summary?.blocks_skipped).toBe(1);
  });
});

describe("streak across closeouts", () => {
  it("grows on a good day and resets on a bad one", async () => {
    await addBlock(1);
    await addBlock(2);
    await log(MON, "done");
    await game.runPendingCloseouts(at(TUE));
    expect((await state()).streak_days).toBe(1);

    await game.runPendingCloseouts(at(WED));
    expect((await state()).streak_days).toBe(0);
  });

  it("holds across a Rest Day: neither broken nor extended", async () => {
    await addBlock(1);
    await addBlock(2);
    await addBlock(3);
    await schedule.declareRestDay(at(MON), TUE);
    await log(MON, "done");
    await log(WED, "done", "Study", WED);

    await game.runPendingCloseouts(at(WED));
    expect((await state()).streak_days).toBe(1);
    expect((await repo.getSummary(TUE))?.day_type).toBe("rest");
    expect((await state()).power).toBe(100);

    await game.runPendingCloseouts(at(THU));
    expect((await state()).streak_days).toBe(2);
  });

  it("treats a day with nothing planned as neutral", async () => {
    await addBlock(1);
    await addBlock(3);
    await log(MON, "done");
    await log(WED, "done", "Study", WED);
    await game.runPendingCloseouts(at(THU));
    // Monday and Wednesday counted, and empty Tuesday neither broke nor extended it.
    expect((await state()).streak_days).toBe(2);
    expect((await repo.getSummary(TUE))?.counted).toBeNull();
  });

  it("feeds the next day's multiplier", async () => {
    await addBlock(1);
    await addBlock(2);
    await log(MON, "done");
    await game.runPendingCloseouts(at(TUE));
    await game.logBlock(at(TUE), (await dayOf(TUE))[0].id, "done", "");
    // 60 Ã— 1.05 multiplier = 63, on top of Monday's 60.
    expect((await state()).total_xp).toBe(123);
  });
});

describe("Shield day", () => {
  it("costs nothing and keeps what was earned", async () => {
    await addBlock(1, { title: "Earned", start_time: "08:00", end_time: "09:00" });
    await addBlock(1, { title: "Open", start_time: "10:00", end_time: "11:00" });
    await log(MON, "done", "Earned");
    await schedule.declareShield(at(MON), MON);

    await game.runPendingCloseouts(at(TUE));

    const current = await state();
    expect(current.total_xp).toBe(60);
    expect(current.power).toBe(100);
    expect((await dayOf(MON)).find((block) => block.title === "Open")?.status).toBe("rest");
    expect((await repo.getSummary(MON))?.day_type).toBe("shield");
  });
});

describe("computeCloseout: collapse and demotion", () => {
  const baseValues: GameValues = {
    total_xp: 0,
    power: 100,
    tier: 1,
    streak_days: 0,
    power_zero_count: 0,
    demotion_count: 0,
    last_closed_date: null,
  };

  const skippedBlock = (minutes = 600): BlockInstance => ({
    id: "b1",
    date: MON,
    start_time: "08:00",
    end_time: `${String(8 + Math.floor(minutes / 60)).padStart(2, "0")}:00`,
    category: "study",
    title: "Study",
    notes: "",
    status: "planned",
    log_note: "",
    logged_at: null,
    template_block_id: "t",
    event_id: null,
    is_edited: false,
    is_cancelled: false,
    focus_broken_count: 0,
  });

  const closeWith = (values: GameValues) =>
    computeCloseout({ date: MON, blocks: [skippedBlock()], restDay: null, ledger: [], values, now: `${MON}T16:00:00Z` });

  it("counts closeouts spent at Power 0", () => {
    const result = closeWith({ ...baseValues, power: 10, total_xp: 5100, tier: 2, power_zero_count: 0 });
    expect(result.values.power).toBe(0);
    expect(result.values.power_zero_count).toBe(1);
    expect(result.summary.collapsed).toBe(false);
  });

  it("resets the counter when Power recovers", () => {
    const quiet = computeCloseout({
      date: MON,
      blocks: [{ ...skippedBlock(60), status: "done", end_time: "09:00" }],
      restDay: null,
      ledger: [],
      values: { ...baseValues, power: 50, power_zero_count: 2 },
      now: `${MON}T16:00:00Z`,
    });
    expect(quiet.values.power_zero_count).toBe(0);
  });

  it("collapses on the third: loses one level, then the counter resets", () => {
    const result = closeWith({ ...baseValues, power: 0, total_xp: 5100, tier: 2, power_zero_count: 2 });
    expect(result.summary.collapsed).toBe(true);
    // Level 10 at 5100 less 120 loss (tier 2 Ã— 600 min Ã— 0.5 weight of 0.25 steps) is level 9, which falls to level 8.
    expect(result.values.total_xp).toBe(3200);
    expect(result.values.power_zero_count).toBe(0);
    const collapse = result.ledger.find((entry) => entry.source === "collapse");
    expect(collapse?.delta_xp).toBeLessThan(0);
  });

  it("collapsing at level 1 falls to 0 XP", () => {
    const result = closeWith({ ...baseValues, power: 0, total_xp: 150, tier: 1, power_zero_count: 2 });
    expect(result.values.total_xp).toBe(0);
  });

  it("warns for two closeouts below the tier, then demotes on the third", () => {
    // Tier 2 needs level 8, and 300 XP is level 2.
    const below = { ...baseValues, total_xp: 300, tier: 2, power: 100 };
    const quietDay = (demotion_count: number) =>
      computeCloseout({
        date: MON,
        blocks: [{ ...skippedBlock(), status: "done" }],
        restDay: null,
        ledger: [{ block_instance_id: "b1", delta_xp: 0, delta_power: 0 }],
        values: { ...below, demotion_count },
        now: `${MON}T16:00:00Z`,
      });

    const first = quietDay(0);
    expect(first.values.tier).toBe(2);
    expect(first.values.demotion_count).toBe(1);

    const third = quietDay(2);
    expect(third.values.tier).toBe(1);
    expect(third.values.demotion_count).toBe(0);
    expect(third.summary.demoted).toBe(true);
  });

  it("resets the warning when the level recovers", () => {
    const recovered = computeCloseout({
      date: MON,
      blocks: [],
      restDay: null,
      ledger: [],
      values: { ...baseValues, total_xp: 3200, tier: 2, demotion_count: 2 },
      now: `${MON}T16:00:00Z`,
    });
    // An empty day is neutral, so a day with work is needed to clear the counter.
    expect(recovered.values.demotion_count).toBe(2);

    const worked = computeCloseout({
      date: MON,
      blocks: [{ ...skippedBlock(), status: "done" }],
      restDay: null,
      ledger: [],
      values: { ...baseValues, total_xp: 3200, tier: 2, demotion_count: 2 },
      now: `${MON}T16:00:00Z`,
    });
    expect(worked.values.demotion_count).toBe(0);
  });

  it("holds both counters on a Rest Day", () => {
    const rested = computeCloseout({
      date: MON,
      blocks: [],
      restDay: { id: "r", date: MON, kind: "rest" },
      ledger: [],
      values: { ...baseValues, power: 0, power_zero_count: 2, demotion_count: 2, tier: 2, streak_days: 5 },
      now: `${MON}T16:00:00Z`,
    });
    expect(rested.values.power_zero_count).toBe(2);
    expect(rested.values.demotion_count).toBe(2);
    expect(rested.values.streak_days).toBe(5);
  });

  it("tier rises immediately when the level reaches it", async () => {
    await repo.createGameState();
    const before = await state();
    await repo.commitGame({
      expected_version: before.version,
      close_date: null,
      instances: [],
      ledger: [],
      state: { ...before, total_xp: 3190 },
      summaries: [],
      audit: [],
    });
    await addBlock(1);
    await log(MON, "done");
    expect((await state()).tier).toBe(2);
    expect((await game.getGameView(at(MON))).seenTier).toBe(1);
  });

  it("loss uses the displayed tier, even while the level is below it", () => {
    const result = closeWith({ ...baseValues, total_xp: 5000, tier: 5, power: 100 });
    // 600 min Ã— 1.0 Ã— 1.25 (tier 5) = 750.
    expect(result.values.total_xp).toBe(4250);
  });
});

describe("corrections after closeout", () => {
  it("can change a closed day within 24 hours, by adding rows", async () => {
    await addBlock(1);
    await game.runPendingCloseouts(at(TUE));
    expect((await state()).power).toBe(94);

    const ctx = { ...at(TUE), now: new Date() };
    const [block] = await dayOf(MON);
    expect(await game.logBlock(ctx, block.id, "done", "")).toEqual({ ok: true });

    const current = await state();
    expect(current.total_xp).toBe(60);
    // Back to 100 from 94, because the skip's âˆ’6 is reversed, with the gain capped at the maximum.
    expect(current.power).toBe(100);
    const ledger = await repo.listAllLedger();
    expect(ledger.at(-1)?.source).toBe("correction");
    expect(ledger.map((entry) => entry.source)).toContain("closeout");
    expect(await game.verifyStateMatchesLedger(ctx)).toBe(true);
  });

  it("refuses a correction after 24 hours", async () => {
    await addBlock(1);
    await game.runPendingCloseouts(at(TUE));
    const [block] = await dayOf(MON);
    const late = { ...at(WED), now: new Date(Date.now() + 25 * 3_600_000) };
    expect(await game.logBlock(late, block.id, "done", "")).toEqual({ ok: false, code: "correctionExpired" });
  });

  it("can't return a closed block to planned", async () => {
    await addBlock(1);
    await game.runPendingCloseouts(at(TUE));
    const [block] = await dayOf(MON);
    const ctx = { ...at(TUE), now: new Date() };
    expect(await game.logBlock(ctx, block.id, "planned", "")).toEqual({ ok: false, code: "correctionNeedsStatus" });
  });

  it("can turn done into skipped, which then costs", async () => {
    await addBlock(1);
    await log(MON, "done");
    await game.runPendingCloseouts(at(TUE));
    expect((await state()).total_xp).toBe(60);

    const [block] = await dayOf(MON);
    await game.logBlock({ ...at(TUE), now: new Date() }, block.id, "skipped", "");
    const current = await state();
    // The 60 earned is reversed, and the loss can't take XP below 0.
    expect(current.total_xp).toBe(0);
    expect(await game.verifyStateMatchesLedger(at(TUE))).toBe(true);
  });

  it("recomputes the streak forward, and leaves later XP alone", async () => {
    await addBlock(1);
    await addBlock(2);
    await log(TUE, "done", "Study", TUE);
    await game.runPendingCloseouts(at(WED));
    // Monday missed, then Tuesday good.
    expect((await state()).streak_days).toBe(1);
    const xpBefore = (await state()).total_xp;

    const [monday] = await dayOf(MON);
    await game.logBlock({ ...at(WED), now: new Date() }, monday.id, "done", "");

    const current = await state();
    expect(current.streak_days).toBe(2);
    expect((await repo.getSummary(MON))?.streak_after).toBe(1);
    expect((await repo.getSummary(TUE))?.streak_before).toBe(1);
    expect((await repo.getSummary(TUE))?.streak_after).toBe(2);
    // Tuesday's XP stands. Monday gains its 60 and its loss is reversed.
    expect(current.total_xp).toBeGreaterThan(xpBefore);
  });

  it("corrects the summary too", async () => {
    await addBlock(1);
    await game.runPendingCloseouts(at(TUE));
    expect((await repo.getSummary(MON))?.blocks_skipped).toBe(1);

    const [block] = await dayOf(MON);
    await game.logBlock({ ...at(TUE), now: new Date() }, block.id, "done", "");

    const summary = await repo.getSummary(MON);
    expect(summary?.blocks_skipped).toBe(0);
    expect(summary?.xp_gained).toBe(60);
    expect(summary?.counted).toBe(true);
  });

  it("protects closed days from other edits", async () => {
    await addBlock(1);
    await game.runPendingCloseouts(at(TUE));
    const [block] = await dayOf(MON);
    expect(await schedule.editInstance(at(TUE), block.id, study(), false)).toEqual({ ok: false, code: "dayClosed" });
  });
});

describe("the ledger is the source of truth", () => {
  it("rebuilds the same XP and Power after a busy history", async () => {
    await addBlock(1, { title: "A", start_time: "08:00", end_time: "10:00" });
    await addBlock(1, { title: "B", start_time: "11:00", end_time: "12:00" });
    await addBlock(2, { title: "C", start_time: "08:00", end_time: "09:30" });
    await addBlock(3, { title: "D", category: "useful_youtube", start_time: "08:00", end_time: "09:30" });

    await log(MON, "done", "A");
    await log(MON, "partial", "A");
    await game.runPendingCloseouts(at(TUE));
    await log(TUE, "done", "C", TUE);
    await game.runPendingCloseouts(at(WED));
    await game.logBlock({ ...at(WED), now: new Date() }, (await dayOf(MON))[1].id, "done", "");
    await log(WED, "skipped", "D", WED);
    await game.runPendingCloseouts(at(FRI));

    const current = await state();
    const replayed = replayLedger(await repo.listAllLedger());
    expect(replayed.total_xp).toBe(current.total_xp);
    expect(replayed.power).toBe(current.power);
    expect(await game.verifyStateMatchesLedger(at(FRI))).toBe(true);
  });
});

describe("replayStreaks", () => {
  const day = (date: string, counted: boolean | null): DailySummary => ({
    date,
    day_type: "normal",
    planned_minutes: 0,
    done_minutes: 0,
    partial_minutes: 0,
    skipped_minutes: 0,
    blocks_skipped: 0,
    xp_gained: 0,
    xp_lost: 0,
    power_change: 0,
    counted,
    streak_before: 3,
    streak_after: 0,
    tier_before: 1,
    tier_after: 1,
    collapsed: false,
    demoted: false,
    seen_at: null,
  });

  it("extends, skips over neutral days, and resets", () => {
    const replayed = replayStreaks([day(MON, true), day(TUE, null), day(WED, true), day(THU, false)]);
    expect(replayed.map((summary) => summary.streak_after)).toEqual([4, 4, 5, 0]);
  });
});

describe("the Reckoning", () => {
  it("adds up everything since it was last seen, then clears on dismissal", async () => {
    await addBlock(1);
    await addBlock(2);
    await log(MON, "done");
    await game.runPendingCloseouts(at(WED));

    const view = await game.getReckoning(at(WED));
    expect(view?.days).toBe(2);
    expect(view?.xpGained).toBe(60);
    expect(view?.xpLost).toBe(15);
    expect(view?.blocksSkipped).toBe(1);
    expect(view?.streak).toBe(0);

    await game.dismissReckoning(at(WED));
    expect(await game.getReckoning(at(WED))).toBeNull();
  });

  it("doesn't interrupt for a quiet empty day", async () => {
    await addBlock(1, { category: "other", title: "Lunch" });
    await game.runPendingCloseouts(at(TUE));
    expect(await game.getReckoning(at(TUE))).toBeNull();
  });

  it("warns when the armor is failing", async () => {
    await repo.createGameState();
    const before = await state();
    await repo.commitGame({
      expected_version: before.version,
      close_date: null,
      instances: [],
      ledger: [],
      state: { ...before, total_xp: 400, tier: 2 },
      summaries: [],
      audit: [],
    });
    await addBlock(1);
    await game.runPendingCloseouts(at(TUE));
    expect((await game.getReckoning(at(TUE)))?.armorFailing).toBe(true);
  });
});

describe("game view", () => {
  it("starts where the spec says", async () => {
    const view = await game.getGameView(at(MON));
    expect(view.totalXp).toBe(0);
    expect(view.level).toBe(1);
    expect(view.tier).toBe(1);
    expect(view.power).toBe(100);
    expect(view.powerState).toBe("empowered");
  });

  it("acknowledges progress so a level-up only plays once", async () => {
    await repo.createGameState();
    const before = await state();
    await repo.commitGame({
      expected_version: before.version,
      close_date: null,
      instances: [],
      ledger: [],
      state: { ...before, total_xp: 5000 },
      summaries: [],
      audit: [],
    });
    expect((await game.getGameView(at(MON))).seenLevel).toBe(1);
    await game.acknowledgeProgress(at(MON));
    expect((await game.getGameView(at(MON))).seenLevel).toBe(10);
  });

  it("counts focus breaks without touching XP or Power", async () => {
    await addBlock(1);
    const [block] = await dayOf(MON);
    await game.recordFocusBroken(at(MON), block.id);
    await game.recordFocusBroken(at(MON), block.id);
    expect((await dayOf(MON))[0].focus_broken_count).toBe(2);
    expect(await repo.listAllLedger()).toEqual([]);
  });
});
