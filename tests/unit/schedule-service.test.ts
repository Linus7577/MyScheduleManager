import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "@/features/schedule/memory-repo";
import type { ScheduleRepo } from "@/features/schedule/repo";
import * as service from "@/features/schedule/service";
import type { BlockFields, BlockInstance, EventFields } from "@/features/schedule/types";

// 2026-11-03 is a Tuesday, so generation runs through Sunday 2026-11-15.
const TODAY = "2026-11-03";
const TOMORROW = "2026-11-04";
const SEEDS = ["Semester", "Exam Week", "Holiday"];

const fields: BlockFields = { start_time: "09:00", end_time: "10:00", category: "study", title: "Study", notes: "" };

let repo: ScheduleRepo;
let ctx: service.ScheduleContext;
let semesterId: string;

const dayOf = async (date: string) => (await service.getDayView(ctx, date)).instances;

async function addBlock(weekday: number, patch: Partial<BlockFields> = {}): Promise<void> {
  await service.createBlock(ctx, { template_id: semesterId, weekday, ...fields, ...patch });
}

async function only(date: string): Promise<BlockInstance> {
  const instances = await dayOf(date);
  expect(instances).toHaveLength(1);
  return instances[0];
}

beforeEach(async () => {
  repo = createMemoryRepo();
  ctx = { repo, today: TODAY };
  await service.ensureLoopReady(ctx, SEEDS);
  semesterId = (await repo.listTemplates())[0].id;
});

describe("seeding", () => {
  it("creates the three templates and activates the first", async () => {
    const view = await service.getTemplatesView(ctx);
    expect(view.templates.map((template) => template.name)).toEqual(SEEDS);
    expect(view.activeId).toBe(semesterId);
  });

  it("only seeds once", async () => {
    await service.ensureLoopReady(ctx, SEEDS);
    expect(await repo.listTemplates()).toHaveLength(3);
  });
});

describe("generation", () => {
  it("fills today through the end of next week", async () => {
    await addBlock(3);
    const rows = await repo.listInstances("2026-11-01", "2026-12-31");
    expect(rows.map((row) => row.date)).toEqual(["2026-11-04", "2026-11-11"]);
  });

  it("is safe to run twice", async () => {
    await addBlock(3);
    await service.ensureLoopReady(ctx, SEEDS);
    await service.ensureLoopReady(ctx, SEEDS);
    expect(await repo.listInstances("2026-11-01", "2026-12-31")).toHaveLength(2);
  });

  it("never puts a newly added block on a past day", async () => {
    await addBlock(1); // Monday was yesterday.
    await service.ensureLoopReady(ctx, SEEDS);
    expect(await dayOf("2026-11-02")).toHaveLength(0);
    expect(await dayOf("2026-11-09")).toHaveLength(1);
  });

  it("extends to the next week when time moves on", async () => {
    await addBlock(3);
    await service.ensureLoopReady({ repo, today: "2026-11-09" }, SEEDS);
    expect(await dayOf("2026-11-18")).toHaveLength(1);
  });

  it("fills in days missed while the app was closed", async () => {
    await addBlock(3);
    await service.ensureLoopReady({ repo, today: "2026-12-01" }, SEEDS);
    expect(await dayOf("2026-11-25")).toHaveLength(1);
  });

  it("doesn't bring back a block removed for one day", async () => {
    await addBlock(3);
    const { id } = await only(TOMORROW);
    await service.cancelInstance(ctx, id);
    await service.ensureLoopReady(ctx, SEEDS);
    expect(await dayOf(TOMORROW)).toHaveLength(0);
  });
});

describe("checking off", () => {
  it("logs done, partial and skipped, and can change its mind", async () => {
    await addBlock(2);
    const { id } = await only(TODAY);

    for (const status of ["done", "partial", "skipped", "planned"] as const) {
      expect(await service.logInstance(ctx, id, status, "")).toEqual({ ok: true });
      expect((await only(TODAY)).status).toBe(status);
    }
  });

  it("keeps a note", async () => {
    await addBlock(2);
    const { id } = await only(TODAY);
    await service.logInstance(ctx, id, "partial", "Ran out of time");
    expect((await only(TODAY)).log_note).toBe("Ran out of time");
  });

  it("records when a block was logged, and clears it when unlogged", async () => {
    await addBlock(2);
    const { id } = await only(TODAY);
    await service.logInstance(ctx, id, "done", "");
    expect((await only(TODAY)).logged_at).not.toBeNull();
    await service.logInstance(ctx, id, "planned", "");
    expect((await only(TODAY)).logged_at).toBeNull();
  });

  it("refuses to log a future block", async () => {
    await addBlock(3);
    const { id } = await only(TOMORROW);
    expect(await service.logInstance(ctx, id, "done", "")).toEqual({ ok: false, code: "futureBlock" });
  });

  it("refuses to log a rest block", async () => {
    await addBlock(2);
    const { id } = await only(TODAY);
    await service.declareShield(ctx, TODAY);
    expect(await service.logInstance(ctx, id, "done", "")).toEqual({ ok: false, code: "notLoggable" });
  });

  it("reports a block that doesn't exist", async () => {
    expect(await service.logInstance(ctx, crypto.randomUUID(), "done", "")).toEqual({ ok: false, code: "notFound" });
  });
});

describe("editing one day", () => {
  it("changes that day only", async () => {
    await addBlock(3);
    const { id } = await only(TOMORROW);
    await service.editInstance(ctx, id, { ...fields, title: "Changed" }, false);

    expect((await only(TOMORROW)).title).toBe("Changed");
    expect((await only("2026-11-11")).title).toBe("Study");
    expect((await repo.listBlocks())[0].title).toBe("Study");
  });

  it("can also change the template, which updates later untouched days", async () => {
    await addBlock(3);
    const { id } = await only(TOMORROW);
    await service.editInstance(ctx, id, { ...fields, title: "Changed" }, true);

    expect((await repo.listBlocks())[0].title).toBe("Changed");
    expect((await only(TOMORROW)).title).toBe("Changed");
    expect((await only("2026-11-11")).title).toBe("Changed");
  });

  it("survives a later template edit", async () => {
    await addBlock(3);
    const { id } = await only(TOMORROW);
    await service.editInstance(ctx, id, { ...fields, title: "Mine" }, false);

    const block = (await repo.listBlocks())[0];
    await service.updateBlock(ctx, block.id, { ...fields, title: "Template", weekday: 3 });

    expect((await only(TOMORROW)).title).toBe("Mine");
    expect((await only("2026-11-11")).title).toBe("Template");
  });

  it("won't remove a logged block", async () => {
    await addBlock(2);
    const { id } = await only(TODAY);
    await service.logInstance(ctx, id, "done", "");
    expect(await service.cancelInstance(ctx, id)).toEqual({ ok: false, code: "notCancellable" });
  });

  it("reports overlaps on a day", async () => {
    await addBlock(3);
    await addBlock(3, { title: "Gym", start_time: "09:30", end_time: "10:30" });
    expect((await service.getDayView(ctx, TOMORROW)).overlaps.size).toBe(2);
  });
});

describe("template changes", () => {
  it("keep logged blocks", async () => {
    await addBlock(2);
    const { id } = await only(TODAY);
    await service.logInstance(ctx, id, "done", "");

    const block = (await repo.listBlocks())[0];
    await service.updateBlock(ctx, block.id, { ...fields, title: "New title", weekday: 2 });

    const today = await only(TODAY);
    expect(today.title).toBe("Study");
    expect(today.status).toBe("done");
  });

  it("removing a block clears future days and keeps logged history", async () => {
    await addBlock(2);
    const { id } = await only(TODAY);
    await service.logInstance(ctx, id, "done", "");

    const block = (await repo.listBlocks())[0];
    await service.deleteBlock(ctx, block.id);

    expect(await dayOf("2026-11-10")).toHaveLength(0);
    expect((await only(TODAY)).status).toBe("done");
    expect((await only(TODAY)).template_block_id).toBeNull();
  });
});

describe("switching template", () => {
  let examId: string;

  beforeEach(async () => {
    examId = (await repo.listTemplates())[1].id;
    await addBlock(3, { title: "Semester block" });
    await service.createBlock(ctx, { template_id: examId, weekday: 3, ...fields, title: "Exam block" });
  });

  it("takes effect from the chosen date only", async () => {
    await service.switchTemplate(ctx, examId, "2026-11-09");
    expect((await only(TOMORROW)).title).toBe("Semester block");
    expect((await only("2026-11-11")).title).toBe("Exam block");
  });

  it("can start today", async () => {
    await service.switchTemplate(ctx, examId, TODAY);
    expect((await only(TOMORROW)).title).toBe("Exam block");
    expect((await service.getTemplatesView(ctx)).activeId).toBe(examId);
  });

  it("keeps blocks you've edited", async () => {
    const { id } = await only(TOMORROW);
    await service.editInstance(ctx, id, { ...fields, title: "Mine" }, false);
    await service.switchTemplate(ctx, examId, TODAY);

    const titles = (await dayOf(TOMORROW)).map((instance) => instance.title).sort();
    expect(titles).toEqual(["Exam block", "Mine"]);
  });

  it("refuses a date in the past", async () => {
    expect(await service.switchTemplate(ctx, examId, "2026-11-02")).toEqual({ ok: false, code: "effectiveInPast" });
  });

  it("lists a scheduled switch without changing today's active template", async () => {
    await service.switchTemplate(ctx, examId, "2026-11-09");
    const view = await service.getTemplatesView(ctx);
    expect(view.activeId).toBe(semesterId);
    expect(view.upcoming.map((activation) => activation.template_id)).toEqual([examId]);
  });

  it("won't delete an active or scheduled template, but will delete an idle one", async () => {
    await service.switchTemplate(ctx, examId, "2026-11-09");
    expect(await service.deleteTemplate(ctx, semesterId)).toEqual({ ok: false, code: "templateInUse" });
    expect(await service.deleteTemplate(ctx, examId)).toEqual({ ok: false, code: "templateInUse" });

    const holidayId = (await repo.listTemplates())[2].id;
    expect(await service.deleteTemplate(ctx, holidayId)).toEqual({ ok: true });
    expect(await repo.listTemplates()).toHaveLength(2);
  });
});

describe("Rest Days and Shields", () => {
  it("turns a future day's blocks to rest", async () => {
    await addBlock(3);
    expect(await service.declareRestDay(ctx, TOMORROW)).toEqual({ ok: true });
    expect((await only(TOMORROW)).status).toBe("rest");
  });

  it("enforces the Rest Day limit from the server", async () => {
    await service.declareRestDay(ctx, TOMORROW);
    expect(await service.declareRestDay(ctx, "2026-11-05")).toEqual({ ok: false, code: "restLimit" });
    expect(await service.declareRestDay(ctx, "2026-11-10")).toEqual({ ok: true });
  });

  it("refuses a same-day Rest Day but allows a same-day Shield", async () => {
    expect(await service.declareRestDay(ctx, TODAY)).toEqual({ ok: false, code: "restMustBeFuture" });
    expect(await service.declareShield(ctx, TODAY)).toEqual({ ok: true });
  });

  it("enforces the Shield limit across the month", async () => {
    await service.declareShield(ctx, "2026-11-03");
    await service.declareShield(ctx, "2026-11-04");
    await service.declareShield(ctx, "2026-11-05");
    expect(await service.declareShield(ctx, "2026-11-30")).toEqual({ ok: false, code: "shieldLimit" });
  });

  it("keeps what's already done on a Shield day and rests the rest", async () => {
    await addBlock(2, { title: "Done one" });
    await addBlock(2, { title: "Partial one", start_time: "11:00", end_time: "12:00" });
    await addBlock(2, { title: "Open one", start_time: "13:00", end_time: "14:00" });
    await addBlock(2, { title: "Skipped one", start_time: "15:00", end_time: "16:00" });
    const statusByTitle = async () =>
      Object.fromEntries((await dayOf(TODAY)).map((instance) => [instance.title, instance.status]));

    const instances = await dayOf(TODAY);
    const find = (title: string) => instances.find((instance) => instance.title === title)!.id;
    await service.logInstance(ctx, find("Done one"), "done", "");
    await service.logInstance(ctx, find("Partial one"), "partial", "");
    await service.logInstance(ctx, find("Skipped one"), "skipped", "");

    await service.declareShield(ctx, TODAY);

    expect(await statusByTitle()).toEqual({
      "Done one": "done",
      "Partial one": "partial",
      "Open one": "rest",
      "Skipped one": "rest",
    });
  });

  it("generates rest blocks on a day declared ahead of generation", async () => {
    await addBlock(3);
    await service.declareRestDay(ctx, "2026-11-18");
    await service.ensureLoopReady({ repo, today: "2026-11-09" }, SEEDS);
    expect((await only("2026-11-18")).status).toBe("rest");
  });

  it("stays rest after a template edit", async () => {
    await addBlock(3);
    await service.declareRestDay(ctx, TOMORROW);
    const block = (await repo.listBlocks())[0];
    await service.updateBlock(ctx, block.id, { ...fields, title: "Changed", weekday: 3 });

    const instance = await only(TOMORROW);
    expect(instance.status).toBe("rest");
    expect(instance.title).toBe("Changed");
  });

  it("can be taken back, which restores the blocks and the allowance", async () => {
    await addBlock(3);
    await service.declareRestDay(ctx, TOMORROW);
    expect(await service.undoRestDay(ctx, TOMORROW)).toEqual({ ok: true });

    expect((await only(TOMORROW)).status).toBe("planned");
    expect((await service.getDayView(ctx, TOMORROW)).restDaysUsed).toBe(0);
  });

  it("can't take back a Rest Day once its day has started", async () => {
    await service.declareRestDay(ctx, TOMORROW);
    expect(await service.undoRestDay({ repo, today: TOMORROW }, TOMORROW)).toEqual({ ok: false, code: "cannotUndo" });
  });

  it("counts usage in the day view", async () => {
    await service.declareRestDay(ctx, TOMORROW);
    await service.declareShield(ctx, "2026-11-05");
    const day = await service.getDayView(ctx, "2026-11-06");
    expect(day.restDaysUsed).toBe(1);
    expect(day.shieldsUsed).toBe(1);
  });
});

describe("one-off events", () => {
  const plain: EventFields = {
    title: "Dentist",
    notes: "",
    category: "other",
    all_day: false,
    start_date: TOMORROW,
    end_date: TOMORROW,
    start_time: "14:00",
    end_time: "15:00",
  };
  const productive: EventFields = { ...plain, title: "Library session", category: "study" };

  it("a plain event isn't a block", async () => {
    await service.createEvent(ctx, plain);
    expect(await dayOf(TOMORROW)).toHaveLength(0);
  });

  it("a productive event can be checked off like a block", async () => {
    await service.createEvent(ctx, productive);
    const instance = await only(TOMORROW);
    expect(instance.title).toBe("Library session");
    expect(instance.event_id).not.toBeNull();

    const later = { repo, today: TOMORROW };
    expect(await service.logInstance(later, instance.id, "done", "")).toEqual({ ok: true });
  });

  it("moving a productive event moves its block and keeps the log", async () => {
    await service.createEvent(ctx, { ...productive, start_date: TODAY, end_date: TODAY });
    const instance = await only(TODAY);
    await service.logInstance(ctx, instance.id, "done", "");
    const [event] = await repo.listEvents(TODAY, TODAY);

    await service.updateEvent(ctx, event.id, { ...productive, start_date: "2026-11-02", end_date: "2026-11-02" });

    expect(await dayOf(TODAY)).toHaveLength(0);
    expect((await only("2026-11-02")).status).toBe("done");
  });

  it("changing category adds or removes the block", async () => {
    await service.createEvent(ctx, plain);
    const [event] = await repo.listEvents(TOMORROW, TOMORROW);

    await service.updateEvent(ctx, event.id, { ...plain, category: "gym" });
    expect(await dayOf(TOMORROW)).toHaveLength(1);

    await service.updateEvent(ctx, event.id, plain);
    expect(await dayOf(TOMORROW)).toHaveLength(0);
  });

  it("deleting the event deletes its block", async () => {
    await service.createEvent(ctx, productive);
    const [event] = await repo.listEvents(TOMORROW, TOMORROW);
    await service.deleteEvent(ctx, event.id);
    expect(await dayOf(TOMORROW)).toHaveLength(0);
  });

  it("is edited through the calendar, not the Loop", async () => {
    await service.createEvent(ctx, productive);
    const { id } = await only(TOMORROW);
    expect(await service.editInstance(ctx, id, fields, false)).toEqual({ ok: false, code: "eventLinked" });
    expect(await service.cancelInstance(ctx, id)).toEqual({ ok: false, code: "eventLinked" });
  });

  it("starts as rest on a declared day", async () => {
    await service.declareRestDay(ctx, TOMORROW);
    await service.createEvent(ctx, productive);
    expect((await only(TOMORROW)).status).toBe("rest");
  });

  it("rejects an invalid event without saving it", async () => {
    const result = await service.createEvent(ctx, { ...productive, all_day: true, start_time: null, end_time: null });
    expect(result).toEqual({ ok: false, code: "eventProductiveTimed" });
    expect(await repo.listEvents(TOMORROW, TOMORROW)).toHaveLength(0);
  });
});

describe("calendar feed", () => {
  it("shows blocks and events, without showing a productive event twice", async () => {
    await addBlock(3);
    await service.createEvent(ctx, {
      title: "Library",
      notes: "",
      category: "study",
      all_day: false,
      start_date: TOMORROW,
      end_date: TOMORROW,
      start_time: "14:00",
      end_time: "15:00",
    });

    const feed = await service.getCalendarFeed(ctx, TOMORROW, TOMORROW);
    expect(feed.map((item) => [item.kind, item.title]).sort()).toEqual([
      ["block", "Study"],
      ["event", "Library"],
    ]);
    expect(feed.find((item) => item.kind === "event")?.status).toBe("planned");
  });

  it("hides removed blocks", async () => {
    await addBlock(3);
    const { id } = await only(TOMORROW);
    await service.cancelInstance(ctx, id);
    expect(await service.getCalendarFeed(ctx, TOMORROW, TOMORROW)).toHaveLength(0);
  });

  it("ends a past-midnight block on the next date", async () => {
    await addBlock(3, { start_time: "23:00", end_time: "01:00" });
    const [item] = await service.getCalendarFeed(ctx, TOMORROW, TOMORROW);
    expect(item.start).toBe("2026-11-04T23:00:00");
    expect(item.end).toBe("2026-11-05T01:00:00");
  });

  it("includes a multi-day event that started before the range", async () => {
    await service.createEvent(ctx, {
      title: "Trip",
      notes: "",
      category: "other",
      all_day: true,
      start_date: "2026-11-02",
      end_date: "2026-11-06",
      start_time: null,
      end_time: null,
    });
    const [item] = await service.getCalendarFeed(ctx, TOMORROW, TOMORROW);
    expect(item.start).toBe("2026-11-02");
    // All-day ends are exclusive in the calendar, so the last day shows as the day after.
    expect(item.end).toBe("2026-11-07");
  });
});
