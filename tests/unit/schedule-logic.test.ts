import { describe, expect, it } from "vitest";
import {
  activeTemplateId,
  addDays,
  buildInstanceRows,
  canUndoRestDay,
  checkDeclareRest,
  checkDeclareShield,
  checkEvent,
  crossesMidnight,
  durationMinutes,
  findInstanceOverlaps,
  findTemplateOverlaps,
  generationEnd,
  isoWeekday,
  restDaysUsedInWeek,
  shieldsUsedInMonth,
  weekDates,
  weekStart,
} from "@/features/schedule/logic";
import type { EventFields, RestDay, TemplateActivation, TemplateBlock } from "@/features/schedule/types";

// 2026-11-03 is a Tuesday.
const TUESDAY = "2026-11-03";

const activation = (template_id: string, effective_from: string): TemplateActivation => ({
  id: `${template_id}-${effective_from}`,
  template_id,
  effective_from,
});

const block = (id: string, weekday: number, start = "09:00", end = "10:00", template_id = "t1"): TemplateBlock => ({
  id,
  template_id,
  weekday,
  start_time: start,
  end_time: end,
  category: "study",
  title: id,
  notes: "",
});

const rest = (date: string, kind: RestDay["kind"] = "rest"): RestDay => ({ id: date, date, kind });

describe("dates", () => {
  it("treats Monday as the first day of the week", () => {
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
    expect(weekStart(TUESDAY)).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekDates(TUESDAY)).toHaveLength(7);
    expect(weekDates(TUESDAY)[6]).toBe("2026-11-08");
  });

  it("generates through the end of next week", () => {
    expect(generationEnd(TUESDAY)).toBe("2026-11-15");
    expect(generationEnd("2026-11-08")).toBe("2026-11-15");
  });

  it("handles month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("block times", () => {
  it("measures normal and past-midnight blocks", () => {
    expect(durationMinutes("09:00", "10:30")).toBe(90);
    expect(durationMinutes("23:00", "01:00")).toBe(120);
    expect(crossesMidnight("23:00", "01:00")).toBe(true);
    expect(crossesMidnight("09:00", "10:00")).toBe(false);
  });
});

describe("activeTemplateId", () => {
  const activations = [activation("semester", "2026-09-01"), activation("exam", "2026-11-10")];

  it("uses the latest activation on or before the date", () => {
    expect(activeTemplateId("2026-11-09", activations)).toBe("semester");
    expect(activeTemplateId("2026-11-10", activations)).toBe("exam");
    expect(activeTemplateId("2026-12-25", activations)).toBe("exam");
  });

  it("has no template before the first activation", () => {
    expect(activeTemplateId("2026-08-31", activations)).toBeNull();
  });
});

describe("buildInstanceRows", () => {
  it("creates a row for each matching weekday", () => {
    const rows = buildInstanceRows({
      from: "2026-11-02",
      to: "2026-11-15",
      activations: [activation("t1", "2026-11-02")],
      blocks: [block("mon", 1), block("sun", 7)],
      restDates: new Set(),
    });
    expect(rows.map((row) => row.date)).toEqual(["2026-11-02", "2026-11-08", "2026-11-09", "2026-11-15"]);
    expect(rows.every((row) => row.status === "planned")).toBe(true);
  });

  it("creates nothing before the template takes effect", () => {
    const rows = buildInstanceRows({
      from: "2026-11-02",
      to: "2026-11-08",
      activations: [activation("t1", TUESDAY)],
      blocks: [block("mon", 1), block("tue", 2)],
      restDates: new Set(),
    });
    expect(rows.map((row) => row.template_block_id)).toEqual(["tue"]);
  });

  it("switches template on the chosen date", () => {
    const rows = buildInstanceRows({
      from: "2026-11-02",
      to: "2026-11-16",
      activations: [activation("t1", "2026-11-01"), activation("t2", "2026-11-09")],
      blocks: [block("old", 1, "09:00", "10:00", "t1"), block("new", 1, "11:00", "12:00", "t2")],
      restDates: new Set(),
    });
    expect(rows.map((row) => [row.date, row.template_block_id])).toEqual([
      ["2026-11-02", "old"],
      ["2026-11-09", "new"],
      ["2026-11-16", "new"],
    ]);
  });

  it("marks blocks on a declared day as rest", () => {
    const rows = buildInstanceRows({
      from: "2026-11-02",
      to: "2026-11-02",
      activations: [activation("t1", "2026-11-02")],
      blocks: [block("mon", 1)],
      restDates: new Set(["2026-11-02"]),
    });
    expect(rows[0].status).toBe("rest");
  });
});

describe("overlaps", () => {
  const instance = (id: string, date: string, start: string, end: string) => ({
    id,
    date,
    start_time: start,
    end_time: end,
  });

  it("flags blocks that overlap and only those", () => {
    const overlaps = findInstanceOverlaps([
      instance("a", TUESDAY, "09:00", "10:00"),
      instance("b", TUESDAY, "09:30", "10:30"),
      instance("c", TUESDAY, "12:00", "13:00"),
    ]);
    expect([...overlaps].sort()).toEqual(["a", "b"]);
  });

  it("doesn't flag blocks that only touch", () => {
    expect(
      findInstanceOverlaps([instance("a", TUESDAY, "09:00", "10:00"), instance("b", TUESDAY, "10:00", "11:00")]).size
    ).toBe(0);
  });

  it("doesn't flag the same time on different days", () => {
    expect(
      findInstanceOverlaps([instance("a", TUESDAY, "09:00", "10:00"), instance("b", "2026-11-04", "09:00", "10:00")])
        .size
    ).toBe(0);
  });

  it("catches a late block running into the next morning", () => {
    const overlaps = findInstanceOverlaps([
      instance("late", TUESDAY, "23:00", "02:00"),
      instance("early", "2026-11-04", "01:00", "03:00"),
    ]);
    expect([...overlaps].sort()).toEqual(["early", "late"]);
  });

  it("catches a long earlier block overlapping a later one past a shorter one", () => {
    const overlaps = findInstanceOverlaps([
      instance("long", TUESDAY, "09:00", "17:00"),
      instance("short", TUESDAY, "09:30", "10:00"),
      instance("later", TUESDAY, "15:00", "16:00"),
    ]);
    expect(overlaps.size).toBe(3);
  });

  it("handles the template week wrapping from Sunday to Monday", () => {
    const overlaps = findTemplateOverlaps([block("sunday", 7, "23:00", "02:00"), block("monday", 1, "01:00", "03:00")]);
    expect([...overlaps].sort()).toEqual(["monday", "sunday"]);
    expect(findTemplateOverlaps([block("a", 1), block("b", 2)]).size).toBe(0);
  });
});

describe("Rest Day rules", () => {
  it("must be declared before the day starts", () => {
    expect(checkDeclareRest(TUESDAY, TUESDAY, [])).toBe("restMustBeFuture");
    expect(checkDeclareRest("2026-11-02", TUESDAY, [])).toBe("restMustBeFuture");
    expect(checkDeclareRest("2026-11-04", TUESDAY, [])).toBeNull();
  });

  it("allows one per Monday-to-Sunday week", () => {
    const used = [rest("2026-11-04")];
    expect(checkDeclareRest("2026-11-08", TUESDAY, used)).toBe("restLimit");
    expect(checkDeclareRest("2026-11-09", TUESDAY, used)).toBeNull();
    expect(restDaysUsedInWeek("2026-11-08", used)).toBe(1);
  });

  it("doesn't count Shields toward the Rest Day limit", () => {
    expect(checkDeclareRest("2026-11-05", TUESDAY, [rest("2026-11-04", "shield")])).toBeNull();
  });

  it("can't be declared twice on one day", () => {
    expect(checkDeclareRest("2026-11-04", TUESDAY, [rest("2026-11-04", "shield")])).toBe("dayAlreadyDeclared");
  });

  it("can be taken back only before its day starts", () => {
    expect(canUndoRestDay(rest("2026-11-04"), TUESDAY)).toBe(true);
    expect(canUndoRestDay(rest(TUESDAY), TUESDAY)).toBe(false);
  });
});

describe("Shield rules", () => {
  it("can be declared today but not for the past", () => {
    expect(checkDeclareShield(TUESDAY, TUESDAY, [])).toBeNull();
    expect(checkDeclareShield("2026-11-02", TUESDAY, [])).toBe("shieldInPast");
  });

  it("allows three per calendar month", () => {
    const used = [rest("2026-11-01", "shield"), rest("2026-11-02", "shield"), rest(TUESDAY, "shield")];
    expect(shieldsUsedInMonth("2026-11-20", used)).toBe(3);
    expect(checkDeclareShield("2026-11-20", TUESDAY, used)).toBe("shieldLimit");
    expect(checkDeclareShield("2026-12-01", TUESDAY, used)).toBeNull();
  });

  it("can be taken back until its day ends", () => {
    expect(canUndoRestDay(rest(TUESDAY, "shield"), TUESDAY)).toBe(true);
    expect(canUndoRestDay(rest("2026-11-02", "shield"), TUESDAY)).toBe(false);
  });
});

describe("checkEvent", () => {
  const event = (patch: Partial<EventFields>): EventFields => ({
    title: "Event",
    notes: "",
    category: "other",
    all_day: false,
    start_date: TUESDAY,
    end_date: TUESDAY,
    start_time: "09:00",
    end_time: "10:00",
    ...patch,
  });

  it("accepts a timed event", () => {
    expect(checkEvent(event({}))).toBeNull();
    expect(checkEvent(event({ category: "study" }))).toBeNull();
  });

  it("accepts all-day and multi-day plain events", () => {
    expect(checkEvent(event({ all_day: true, start_time: null, end_time: null, end_date: "2026-11-05" }))).toBeNull();
    expect(checkEvent(event({ end_date: "2026-11-05", end_time: "08:00" }))).toBeNull();
  });

  it("requires productive events to be timed on one date", () => {
    expect(checkEvent(event({ category: "gym", all_day: true, start_time: null, end_time: null }))).toBe(
      "eventProductiveTimed"
    );
    expect(checkEvent(event({ category: "gym", end_date: "2026-11-04" }))).toBe("eventProductiveTimed");
  });

  it("rejects an end before the start", () => {
    expect(checkEvent(event({ end_date: "2026-11-02" }))).toBe("eventEndBeforeStart");
    expect(checkEvent(event({ start_time: "10:00", end_time: "09:00" }))).toBe("eventEndBeforeStart");
  });

  it("rejects inconsistent all-day and time values", () => {
    expect(checkEvent(event({ all_day: true }))).toBe("invalid");
    expect(checkEvent(event({ start_time: null }))).toBe("invalid");
  });
});
