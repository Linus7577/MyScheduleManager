import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "@/features/schedule/memory-repo";
import { movedEventFields } from "@/features/schedule/logic";
import { buildIcs, parseIcs } from "@/features/schedule/ics";
import { expandEvents, isUsableRule, nextOccurrence } from "@/features/schedule/recurrence";
import * as service from "@/features/schedule/service";
import type { CalendarEvent, EventFields } from "@/features/schedule/types";

const TAIPEI = "Asia/Taipei";
// 2026-11-02 is a Monday.
const MONDAY = "2026-11-02";

const event = (patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  title: "Class",
  notes: "",
  category: "other",
  all_day: false,
  start_date: MONDAY,
  end_date: MONDAY,
  start_time: "09:00",
  end_time: "10:00",
  rrule: null,
  exdates: [],
  ics_uid: null,
  ...patch,
});

const dates = (item: CalendarEvent, from: string, to: string) =>
  expandEvents([item], from, to).map((occurrence) => occurrence.start_date);

describe("which repeat rules can be used", () => {
  it("accepts daily, weekly, monthly and yearly rules", () => {
    for (const rule of ["FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10", "RRULE:FREQ=MONTHLY", "FREQ=YEARLY;INTERVAL=2"]) {
      expect(isUsableRule(rule, MONDAY), rule).toBe(true);
    }
  });

  it("refuses text that isn't a rule, or rules that never happen or repeat within a day", () => {
    const refused = [
      "",
      "hello",
      "FREQ=NOPE",
      "BYDAY=MO",
      "FREQ=HOURLY",
      "FREQ=DAILY;INTERVAL=0",
      "FREQ=DAILY;INTERVAL=-1",
      "FREQ=DAILY;COUNT=0",
      "FREQ=DAILY;UNTIL=20200101T000000Z",
      "FREQ=DAILY;BYHOUR=9,10",
      `FREQ=DAILY;${"X".repeat(400)}`,
    ];
    for (const rule of refused) expect(isUsableRule(rule, MONDAY), rule).toBe(false);
  });
});

describe("showing repeating events", () => {
  it("lists each date a rule lands on inside the range", () => {
    expect(dates(event({ rrule: "FREQ=DAILY" }), "2026-11-03", "2026-11-05")).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(dates(event({ rrule: "FREQ=WEEKLY" }), "2026-11-01", "2026-11-20")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });

  it("starts no earlier than the event's first date", () => {
    expect(dates(event({ rrule: "FREQ=DAILY" }), "2026-10-30", MONDAY)).toEqual([MONDAY]);
  });

  it("leaves out dates taken out of the series", () => {
    expect(dates(event({ rrule: "FREQ=DAILY", exdates: ["2026-11-04"] }), "2026-11-03", "2026-11-05")).toEqual(["2026-11-03", "2026-11-05"]);
  });

  it("stops at the rule's count", () => {
    expect(dates(event({ rrule: "FREQ=DAILY;COUNT=2" }), MONDAY, "2026-11-20")).toEqual([MONDAY, "2026-11-03"]);
  });

  it("shows a multi-day stay that began before the range and runs into it", () => {
    const stay = event({ all_day: true, start_time: null, end_time: null, end_date: "2026-11-04", rrule: "FREQ=WEEKLY" });
    const [first] = expandEvents([stay], "2026-11-03", "2026-11-03");
    expect(first).toMatchObject({ start_date: MONDAY, end_date: "2026-11-04" });
  });

  it("gives a one-off event only if it touches the range", () => {
    expect(dates(event(), MONDAY, MONDAY)).toEqual([MONDAY]);
    expect(dates(event(), "2026-11-03", "2026-11-04")).toEqual([]);
  });

  it("finds the next date, stepping over removed ones, and falls back to the first date when it's over", () => {
    expect(nextOccurrence(event({ rrule: "FREQ=WEEKLY" }), "2026-11-03")).toBe("2026-11-09");
    expect(nextOccurrence(event({ rrule: "FREQ=WEEKLY", exdates: ["2026-11-09"] }), "2026-11-03")).toBe("2026-11-16");
    expect(nextOccurrence(event({ rrule: "FREQ=DAILY;COUNT=1" }), "2026-12-01")).toBe(MONDAY);
  });
});

describe("dragging and resizing", () => {
  it("moves a timed event, keeping everything else", () => {
    const fields = movedEventFields(event({ title: "Keep", notes: "Me" }), "2026-11-05T14:30:00Z", "2026-11-05T16:00:00Z", false);
    expect(fields).toMatchObject({ title: "Keep", notes: "Me", start_date: "2026-11-05", end_date: "2026-11-05", start_time: "14:30", end_time: "16:00", all_day: false });
  });

  it("turns the calendar's day-after end back into the last day of an all-day event", () => {
    const fields = movedEventFields(event(), "2026-11-05", "2026-11-08", true);
    expect(fields).toMatchObject({ all_day: true, start_date: "2026-11-05", end_date: "2026-11-07", start_time: null, end_time: null });
  });

  it("gives a timed event an hour when the calendar has no end for it", () => {
    expect(movedEventFields(event(), "2026-11-05T14:30:00Z", null, false)).toMatchObject({ end_date: "2026-11-05", end_time: "15:30" });
    expect(movedEventFields(event(), "2026-11-05", null, true)).toMatchObject({ end_date: "2026-11-05" });
  });
});

describe("repeating events and XP", () => {
  const study: EventFields = {
    title: "Study group",
    notes: "",
    category: "study",
    all_day: false,
    start_date: MONDAY,
    end_date: MONDAY,
    start_time: "09:00",
    end_time: "10:00",
  };
  let repo: ReturnType<typeof createMemoryRepo>;
  const ctx = () => ({ repo, today: MONDAY });

  beforeEach(() => {
    repo = createMemoryRepo();
  });

  it("gives a one-off productive event a block, and a repeating one none", async () => {
    await service.createEvent(ctx(), { ...study, rrule: "FREQ=WEEKLY" });
    expect(await repo.listInstances(MONDAY, MONDAY)).toHaveLength(0);

    await service.createEvent(ctx(), study);
    expect(await repo.listInstances(MONDAY, MONDAY)).toHaveLength(1);
  });

  it("removes the block when a one-off productive event starts repeating", async () => {
    await service.createEvent(ctx(), study);
    const [stored] = await repo.listEvents(MONDAY, MONDAY);
    expect(await service.updateEvent(ctx(), stored.id, { ...study, rrule: "FREQ=DAILY" })).toEqual({ ok: true });
    expect(await repo.listInstances(MONDAY, MONDAY)).toHaveLength(0);
  });

  it("allows a repeating event of a productive category to be all day", async () => {
    const allDay = { ...study, all_day: true, start_time: null, end_time: null };
    expect(await service.createEvent(ctx(), allDay)).toEqual({ ok: false, code: "eventProductiveTimed" });
    expect(await service.createEvent(ctx(), { ...allDay, rrule: "FREQ=DAILY" })).toEqual({ ok: true });
  });

  it("refuses a rule that can't be used", async () => {
    expect(await service.createEvent(ctx(), { ...study, rrule: "FREQ=SECONDLY" })).toEqual({ ok: false, code: "badRepeat" });
    expect(await service.createEvent(ctx(), { ...study, rrule: "nonsense" })).toEqual({ ok: false, code: "badRepeat" });
  });

  it("takes one date out of a series and leaves the rest", async () => {
    await service.createEvent(ctx(), { ...study, category: "other", rrule: "FREQ=DAILY" });
    const [stored] = await repo.listEvents(MONDAY, MONDAY);
    expect(await service.skipOccurrence(ctx(), stored.id, "2026-11-03")).toEqual({ ok: true });
    const feed = await service.getCalendarFeed(ctx(), MONDAY, "2026-11-04");
    expect(feed.filter((item) => item.kind === "event").map((item) => item.date)).toEqual([MONDAY, "2026-11-04"]);
  });

  it("refuses to take a date out of a one-off event", async () => {
    await service.createEvent(ctx(), { ...study, category: "other" });
    const [stored] = await repo.listEvents(MONDAY, MONDAY);
    expect(await service.skipOccurrence(ctx(), stored.id, MONDAY)).toEqual({ ok: false, code: "invalid" });
  });

  it("feeds a series with a different id for each date, all pointing at one event", async () => {
    await service.createEvent(ctx(), { ...study, category: "other", rrule: "FREQ=DAILY" });
    const feed = await service.getCalendarFeed(ctx(), MONDAY, "2026-11-03");
    expect(new Set(feed.map((item) => item.id)).size).toBe(2);
    expect(new Set(feed.map((item) => item.event?.id)).size).toBe(1);
  });

  it("finds events and blocks by search, closest to today first", async () => {
    await service.createEvent(ctx(), { ...study, category: "other", title: "Dentist far", start_date: "2027-03-01", end_date: "2027-03-01" });
    await service.createEvent(ctx(), { ...study, category: "other", title: "dentist near", start_date: "2026-11-04", end_date: "2026-11-04" });
    await service.createEvent(ctx(), { ...study, category: "other", title: "Other", notes: "See the DENTIST", start_date: "2026-11-20", end_date: "2026-11-20" });
    const hits = await service.searchCalendar(ctx(), "dentist");
    expect(hits.map((hit) => hit.title)).toEqual(["dentist near", "Other", "Dentist far"]);
    expect(await service.searchCalendar(ctx(), "nothing like this")).toEqual([]);
  });
});

describe("reading calendar files", () => {
  const options = { timeZone: TAIPEI, untitled: "Untitled" };
  const file = (...lines: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");
  const vevent = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
  const read = (...lines: string[]) => parseIcs(file(...lines), options);

  it("refuses text that isn't a calendar", () => {
    expect(parseIcs("just some words", options)).toBeNull();
    expect(parseIcs("", options)).toBeNull();
  });

  it("reads a timed event in UTC onto the owner's clock", () => {
    const result = read(vevent("UID:a", "SUMMARY:Meet", "DTSTART:20261104T010000Z", "DTEND:20261104T020000Z"));
    expect(result?.events[0]).toMatchObject({
      title: "Meet",
      category: "other",
      all_day: false,
      start_date: "2026-11-04",
      end_date: "2026-11-04",
      start_time: "09:00",
      end_time: "10:00",
      rrule: null,
      ics_uid: "a",
    });
  });

  it("moves an event from another timezone onto the owner's clock, including across midnight", () => {
    const result = read(vevent("UID:b", "SUMMARY:Call", "DTSTART;TZID=America/New_York:20261104T200000", "DTEND;TZID=America/New_York:20261104T210000"));
    // New York is 13 hours behind Taipei in November.
    expect(result?.events[0]).toMatchObject({ start_date: "2026-11-05", start_time: "09:00", end_time: "10:00" });
  });

  it("takes a time as written when it has no timezone or an unknown one", () => {
    expect(read(vevent("UID:c", "SUMMARY:A", "DTSTART:20261104T090000"))?.events[0]).toMatchObject({ start_time: "09:00", end_time: "10:00" });
    expect(read(vevent("UID:d", "SUMMARY:B", "DTSTART;TZID=Pacific Standard Time:20261104T090000"))?.events[0].start_time).toBe("09:00");
  });

  it("reads all-day events, whose end date in the file is the day after the last", () => {
    const result = read(vevent("UID:e", "SUMMARY:Trip", "DTSTART;VALUE=DATE:20261104", "DTEND;VALUE=DATE:20261107"));
    expect(result?.events[0]).toMatchObject({ all_day: true, start_date: "2026-11-04", end_date: "2026-11-06", start_time: null, end_time: null });
    const single = read(vevent("UID:f", "SUMMARY:Day", "DTSTART;VALUE=DATE:20261104"));
    expect(single?.events[0]).toMatchObject({ all_day: true, end_date: "2026-11-04" });
  });

  it("reads an event's length from DURATION", () => {
    const timed = read(vevent("UID:g", "SUMMARY:A", "DTSTART:20261104T010000Z", "DURATION:PT1H30M"));
    expect(timed?.events[0]).toMatchObject({ start_time: "09:00", end_time: "10:30" });
    const allDay = read(vevent("UID:h", "SUMMARY:B", "DTSTART;VALUE=DATE:20261104", "DURATION:P2D"));
    expect(allDay?.events[0].end_date).toBe("2026-11-05");
  });

  it("gives an event of no length the same hour as one with no end", () => {
    const result = read(vevent("UID:i", "SUMMARY:A", "DTSTART:20261104T010000Z", "DTEND:20261104T010000Z"));
    expect(result?.events[0].end_time).toBe("10:00");
  });

  it("unfolds long lines and undoes the file's escaping", () => {
    const result = read(vevent("UID:j", "SUMMARY:Long\r\n  title\\, part\\; two", "DESCRIPTION:Line one\\nLine two", "LOCATION:Room 1", "DTSTART;VALUE=DATE:20261104"));
    expect(result?.events[0]).toMatchObject({ title: "Long title, part; two", notes: "Room 1\nLine one\nLine two" });
  });

  it("doesn't read a reminder's properties as the event's own", () => {
    const result = read(vevent("UID:k", "SUMMARY:Real", "DTSTART;VALUE=DATE:20261104", "BEGIN:VALARM", "DESCRIPTION:Reminder text", "END:VALARM"));
    expect(result?.events[0].notes).toBe("");
  });

  it("names an event with no title, and shortens over-long text", () => {
    const result = read(vevent("UID:l", "DTSTART;VALUE=DATE:20261104"), vevent("UID:m", `SUMMARY:${"x".repeat(300)}`, "DTSTART;VALUE=DATE:20261104"));
    expect(result?.events[0].title).toBe("Untitled");
    expect(result?.events[1].title).toHaveLength(120);
  });

  it("counts events with no readable start as skipped, and leaves out cancelled ones", () => {
    const result = read(vevent("UID:n", "SUMMARY:No date"), vevent("UID:o", "SUMMARY:Bad", "DTSTART:notadate"), vevent("UID:p", "SUMMARY:Off", "STATUS:CANCELLED", "DTSTART;VALUE=DATE:20261104"));
    expect(result).toMatchObject({ events: [], skipped: 2 });
  });

  it("keeps a usable repeat rule and its removed dates", () => {
    const result = read(vevent("UID:q", "SUMMARY:Class", "DTSTART;TZID=Asia/Taipei:20261102T090000", "DTEND;TZID=Asia/Taipei:20261102T100000", "RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;TZID=Asia/Taipei:20261109T090000,20261116T090000"));
    expect(result?.events[0]).toMatchObject({ rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: ["2026-11-09", "2026-11-16"] });
    expect(result?.repeatsDropped).toBe(0);
  });

  it("moves a rule's weekday when the owner's clock moved the date", () => {
    // Monday 20:00 in New York is Tuesday morning in Taipei.
    const result = read(vevent("UID:r", "SUMMARY:Class", "DTSTART;TZID=America/New_York:20261102T200000", "RRULE:FREQ=WEEKLY;BYDAY=MO"));
    expect(result?.events[0]).toMatchObject({ start_date: "2026-11-03", rrule: "FREQ=WEEKLY;BYDAY=TU" });
    expect(dates({ ...event(), ...result?.events[0] } as CalendarEvent, "2026-11-03", "2026-11-10")).toEqual(["2026-11-03", "2026-11-10"]);
  });

  it("puts a rule's end on the owner's clock, so an evening's last date isn't lost", () => {
    // 2026-11-09 12:00 UTC is 20:00 in Taipei.
    const result = read(vevent("UID:s", "SUMMARY:Class", "DTSTART:20261102T120000Z", "RRULE:FREQ=WEEKLY;UNTIL=20261109T120000Z"));
    expect(dates({ ...event(), ...result?.events[0] } as CalendarEvent, "2026-11-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("keeps only the first date when a rule can't be used", () => {
    const result = read(vevent("UID:t", "SUMMARY:Often", "DTSTART;VALUE=DATE:20261104", "RRULE:FREQ=HOURLY"));
    expect(result?.events[0].rrule).toBeNull();
    expect(result?.repeatsDropped).toBe(1);
  });

  it("treats a changed date of a series as its own event, and takes that date out of the series", () => {
    const result = read(
      vevent("UID:u", "SUMMARY:Class", "DTSTART;VALUE=DATE:20261102", "RRULE:FREQ=WEEKLY"),
      vevent("UID:u", "RECURRENCE-ID;VALUE=DATE:20261109", "SUMMARY:Class moved", "DTSTART;VALUE=DATE:20261110")
    );
    expect(result?.events).toHaveLength(2);
    expect(result?.events[0].exdates).toEqual(["2026-11-09"]);
    expect(result?.events[1]).toMatchObject({ title: "Class moved", rrule: null, ics_uid: "u#2026-11-09" });
  });

  it("takes a cancelled date out of a series without adding anything", () => {
    const result = read(
      vevent("UID:v", "SUMMARY:Class", "DTSTART;VALUE=DATE:20261102", "RRULE:FREQ=WEEKLY"),
      vevent("UID:v", "RECURRENCE-ID;VALUE=DATE:20261109", "STATUS:CANCELLED", "DTSTART;VALUE=DATE:20261109")
    );
    expect(result?.events).toHaveLength(1);
    expect(result?.events[0].exdates).toEqual(["2026-11-09"]);
  });
});

describe("writing calendar files", () => {
  const stamp = new Date("2026-11-04T00:00:00Z");
  const options = { timeZone: TAIPEI, untitled: "Untitled" };

  it("gets every kind of event back the same when it's read again", () => {
    const events = [
      event({ title: "Timed, with; marks", notes: "Line one\nLine two" }),
      event({ id: "e2", title: "Trip", all_day: true, start_time: null, end_time: null, end_date: "2026-11-05" }),
      event({ id: "e3", title: "Repeats", rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: ["2026-11-09"] }),
      event({ id: "e4", title: "Repeats all day", all_day: true, start_time: null, end_time: null, rrule: "FREQ=MONTHLY", exdates: ["2026-12-02"] }),
      event({ id: "e5", title: "繁體中文的活動名稱".repeat(10).slice(0, 80), end_date: "2026-11-03", end_time: "01:00" }),
    ];
    const back = parseIcs(buildIcs(events, TAIPEI, stamp), options);
    expect(back?.events).toHaveLength(events.length);
    events.forEach((original, index) => {
      const fields: Partial<CalendarEvent> = { ...original };
      delete fields.id;
      delete fields.ics_uid;
      expect(back?.events[index], original.title).toMatchObject(fields);
    });
  });

  it("gets a repeat's end date back the same", () => {
    const events = [event({ rrule: "FREQ=DAILY;UNTIL=20261110T235959Z" })];
    const written = buildIcs(events, TAIPEI, stamp);
    // In the file it's real UTC, which is 8 hours behind Taipei.
    expect(written).toContain("UNTIL=20261110T155959Z");
    expect(parseIcs(written, options)?.events[0].rrule).toBe("FREQ=DAILY;UNTIL=20261110T235959Z");
  });

  it("follows the standard's line endings and line length, without splitting a character", () => {
    const written = buildIcs([event({ title: "繁體中文".repeat(30) })], TAIPEI, stamp);
    expect(written.endsWith("\r\n")).toBe(true);
    for (const line of written.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
  });

  it("recognizes an exported file, so importing it adds nothing", async () => {
    const repo = createMemoryRepo();
    const ctx = { repo, today: MONDAY, timeZone: TAIPEI };
    await service.createEvent(ctx, { ...event(), rrule: null });
    const written = buildIcs(await repo.listAllEvents(), TAIPEI, stamp);

    expect(await service.importCalendar(ctx, written, "Untitled")).toMatchObject({ ok: true, added: 0, duplicates: 1 });
    expect(await repo.listAllEvents()).toHaveLength(1);
  });

  it("adds a new file's events once, even if it's imported twice", async () => {
    const repo = createMemoryRepo();
    const ctx = { repo, today: MONDAY, timeZone: TAIPEI };
    const text = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:x", "SUMMARY:New", "DTSTART;VALUE=DATE:20261104", "END:VEVENT", "END:VCALENDAR"].join("\r\n");

    expect(await service.importCalendar(ctx, text, "Untitled")).toMatchObject({ ok: true, added: 1, duplicates: 0 });
    expect(await service.importCalendar(ctx, text, "Untitled")).toMatchObject({ ok: true, added: 0, duplicates: 1 });
    expect(await service.importCalendar(ctx, "not a calendar", "Untitled")).toEqual({ ok: false, code: "badCalendarFile" });
    // Imported events are plain, so they can't cost or earn anything.
    expect(await repo.listInstances("2026-11-04", "2026-11-04")).toHaveLength(0);
  });
});
