import { isValidTimeZone, wallClockInTimeZone } from "@/lib/time/today";
import { addDays } from "./logic";
import { isUsableRule } from "./recurrence";
import type { CalendarEvent, ImportedEvent } from "./types";

const MAX_EVENTS = 2000;
const MAX_TITLE = 120;
const MAX_NOTES = 2000;
const MAX_LINE_BYTES = 73;
const ONE_HOUR_MS = 3_600_000;
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const UID_DOMAIN = "my-schedule-manager";

type Property = { params: Record<string, string>; value: string };
type Moment = { date: string; time: string | null };

/** Long lines in a calendar file continue on the next line, which starts with a space. */
function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): { name: string; property: Property } | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length && colon === -1; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) colon = i;
  }
  if (colon === -1) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const [key, ...rest] = param.split("=");
    params[key.toUpperCase()] = rest.join("=").replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), property: { params, value: line.slice(colon + 1) } };
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, mark: string) => (mark === "n" || mark === "N" ? "\n" : mark));
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** The exact instant a wall-clock time means in a timezone. Corrected twice, because the offset can change. */
function instantOf(local: string, zone: string): Date {
  const wanted = Date.parse(`${local}Z`);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    guess += wanted - Date.parse(`${wallClockInTimeZone(zone, new Date(guess))}Z`);
  }
  return new Date(guess);
}

function realDate(year: string, month: string, day: string): string | null {
  const date = `${year}-${month}-${day}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

/** Reads a date or date-time, and gives it back on the owner's wall clock. */
function readMoment(value: string, zoneParam: string | undefined, ownerZone: string): Moment | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!match) return null;
  const date = realDate(match[1], match[2], match[3]);
  if (!date) return null;
  if (!match[4]) return { date, time: null };
  const time = `${match[4]}:${match[5]}`;
  const zone = match[7] ? "UTC" : zoneParam;
  // No timezone, or a name only one vendor uses: the time is taken as written.
  if (!zone || !isValidTimeZone(zone)) return { date, time };
  const wall = wallClockInTimeZone(ownerZone, instantOf(`${date}T${time}:${match[6]}`, zone));
  return { date: wall.slice(0, 10), time: wall.slice(11, 16) };
}

function durationMs(value: string): number | null {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!match) return null;
  const [weeks, days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  return ((weeks * 7 + days) * 24 * 3600 + hours * 3600 + minutes * 60 + seconds) * 1000;
}

function plusMs(moment: { date: string; time: string }, ms: number): { date: string; time: string } {
  const at = new Date(Date.parse(`${moment.date}T${moment.time}:00Z`) + ms).toISOString();
  return { date: at.slice(0, 10), time: at.slice(11, 16) };
}

/**
 * A rule's days are written for the file's timezone. If moving to the owner's clock changed the date,
 * as an evening in New York becomes the next morning in Taipei, its days have to move with it.
 */
function shiftRuleDays(rule: string, days: number): string {
  if (days === 0) return rule;
  return rule
    .replace(/BYDAY=([^;]+)/i, (_, list: string) => {
      const shifted = list.split(",").map((part) => {
        const index = WEEKDAYS.indexOf(part.slice(-2).toUpperCase());
        return index === -1 ? part : `${part.slice(0, -2)}${WEEKDAYS[(index + days + 7) % 7]}`;
      });
      return `BYDAY=${shifted.join(",")}`;
    })
    .replace(/BYMONTHDAY=([^;]+)/i, (_, list: string) => {
      const shifted = list.split(",").map((part) => {
        const day = Number(part);
        return day >= 1 && day + days >= 1 && day + days <= 31 ? String(day + days) : part;
      });
      return `BYMONTHDAY=${shifted.join(",")}`;
    });
}

/** A rule's end is real UTC in the file, while the app stores everything as the owner's wall clock. */
function untilToWallClock(rule: string, ownerZone: string): string {
  return rule.replace(/UNTIL=(\d{8}T\d{6})Z/i, (_, value: string) => {
    const moment = readMoment(`${value}Z`, undefined, ownerZone);
    if (!moment) return `UNTIL=${value}Z`;
    return `UNTIL=${moment.date.replace(/-/g, "")}T${moment.time?.replace(":", "")}${value.slice(-2)}Z`;
  });
}

function dayShift(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type IcsResult = { events: ImportedEvent[]; skipped: number; repeatsDropped: number };

/** Reads a calendar file. Returns null if it isn't one. Everything imported is a plain event, with no XP. */
export function parseIcs(text: string, options: { timeZone: string; untitled: string }): IcsResult | null {
  const lines = unfold(text);
  if (!lines.some((line) => line.trim().toUpperCase() === "BEGIN:VCALENDAR")) return null;

  const raw: Map<string, Property[]>[] = [];
  let current: Map<string, Property[]> | null = null;
  // Reminders sit inside an event and have properties of their own, which must not be read as the event's.
  let nested = 0;
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, property } = parsed;
    const value = property.value.trim().toUpperCase();
    if (name === "BEGIN" && value === "VEVENT") {
      current = new Map();
      nested = 0;
    } else if (name === "END" && value === "VEVENT") {
      if (current) raw.push(current);
      current = null;
    } else if (current) {
      if (name === "BEGIN") nested++;
      else if (name === "END") nested--;
      else if (nested === 0) current.set(name, [...(current.get(name) ?? []), property]);
    }
  }

  const overrides = new Map<string, string[]>();
  const events: (ImportedEvent & { uid: string | null })[] = [];
  let skipped = 0;
  let repeatsDropped = 0;

  for (const item of raw) {
    const one = (name: string) => item.get(name)?.[0];
    const moment = (property: Property | undefined) =>
      property ? readMoment(property.value, property.params.TZID, options.timeZone) : null;

    const uid = one("UID")?.value.trim() || null;
    const replaced = moment(one("RECURRENCE-ID"));
    if (uid && replaced) overrides.set(uid, [...(overrides.get(uid) ?? []), replaced.date]);
    if (one("STATUS")?.value.trim().toUpperCase() === "CANCELLED") continue;

    const dateStart = one("DTSTART");
    const start = moment(dateStart);
    if (!dateStart || !start) {
      skipped++;
      continue;
    }

    const title = unescapeText(one("SUMMARY")?.value ?? "").trim().slice(0, MAX_TITLE) || options.untitled;
    const place = unescapeText(one("LOCATION")?.value ?? "").trim();
    const details = unescapeText(one("DESCRIPTION")?.value ?? "").trim();
    const notes = [place, details].filter(Boolean).join("\n").slice(0, MAX_NOTES);

    const end = moment(one("DTEND"));
    const duration = one("DURATION") ? durationMs(one("DURATION")?.value ?? "") : null;
    let end_date = start.date;
    let end_time: string | null = null;
    if (start.time === null) {
      if (end) end_date = addDays(end.date, -1);
      else if (duration) end_date = addDays(start.date, Math.max(Math.ceil(duration / 86_400_000) - 1, 0));
      if (end_date < start.date) end_date = start.date;
    } else {
      const timed = { date: start.date, time: start.time };
      const finish =
        end?.time != null ? { date: end.date, time: end.time } : duration ? plusMs(timed, duration) : plusMs(timed, ONE_HOUR_MS);
      // The app has no zero-length or backwards events, so these get the same hour a missing end does.
      const usable = `${finish.date}T${finish.time}` > `${timed.date}T${timed.time}` ? finish : plusMs(timed, ONE_HOUR_MS);
      end_date = usable.date;
      end_time = usable.time;
    }

    let rrule: string | null = null;
    const exdates: string[] = [];
    const ruleText = one("RRULE")?.value.trim();
    if (ruleText && !replaced) {
      // The file's own date tells how far the owner's clock moved this event.
      const written = /^(\d{4})(\d{2})(\d{2})/.exec(dateStart.value.trim());
      const fromDate = written ? `${written[1]}-${written[2]}-${written[3]}` : start.date;
      const rule = untilToWallClock(shiftRuleDays(ruleText, dayShift(fromDate, start.date)), options.timeZone);
      if (isUsableRule(rule, start.date, start.time)) rrule = rule;
      else repeatsDropped++;
      for (const property of item.get("EXDATE") ?? []) {
        for (const value of property.value.split(",")) {
          const removed = readMoment(value, property.params.TZID, options.timeZone);
          if (removed) exdates.push(removed.date);
        }
      }
    }

    const key = uid ?? `no-uid:${start.date}:${start.time ?? ""}:${title}`;
    events.push({
      title,
      notes,
      category: "other",
      all_day: start.time === null,
      start_date: start.date,
      end_date,
      start_time: start.time,
      end_time,
      rrule,
      exdates,
      ics_uid: (replaced ? `${key}#${replaced.date}` : key).slice(0, 500),
      uid: replaced ? null : uid,
    });
  }

  const kept = events.slice(0, MAX_EVENTS).map(({ uid, ...event }) => {
    const removed = uid ? overrides.get(uid) : undefined;
    return removed ? { ...event, exdates: [...new Set([...event.exdates, ...removed])] } : event;
  });
  return { events: kept, skipped: skipped + Math.max(events.length - MAX_EVENTS, 0), repeatsDropped };
}

/** The id this event has in a calendar file, so that a file exported here isn't added again when imported. */
export function eventUid(event: CalendarEvent): string {
  return event.ics_uid ?? `${event.id}@${UID_DOMAIN}`;
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let part = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > MAX_LINE_BYTES) {
      parts.push(part);
      part = " ";
      bytes = 1;
    }
    part += character;
    bytes += size;
  }
  parts.push(part);
  return parts.join("\r\n");
}

const compactDate = (date: string) => date.replace(/-/g, "");
const compactLocal = (date: string, time: string) => `${compactDate(date)}T${time.replace(":", "")}00`;
const compactInstant = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function eventLines(event: CalendarEvent, timeZone: string, stamp: Date): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${escapeText(eventUid(event))}`, `DTSTAMP:${compactInstant(stamp)}`];
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.notes) lines.push(`DESCRIPTION:${escapeText(event.notes)}`);

  if (event.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(event.start_date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(event.end_date, 1))}`);
  } else if (event.rrule) {
    // A repeating event needs its timezone named, so it stays at the same hour if the clocks change.
    lines.push(`DTSTART;TZID=${timeZone}:${compactLocal(event.start_date, event.start_time as string)}`);
    lines.push(`DTEND;TZID=${timeZone}:${compactLocal(event.end_date, event.end_time as string)}`);
  } else {
    lines.push(`DTSTART:${compactInstant(instantOf(`${event.start_date}T${event.start_time}:00`, timeZone))}`);
    lines.push(`DTEND:${compactInstant(instantOf(`${event.end_date}T${event.end_time}:00`, timeZone))}`);
  }

  if (event.rrule) {
    const rule = event.rrule.replace(/^RRULE:/i, "").replace(/UNTIL=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/i, (_, y, mo, d, h, mi, s) =>
      `UNTIL=${compactInstant(instantOf(`${y}-${mo}-${d}T${h}:${mi}:${s}`, timeZone))}`
    );
    lines.push(`RRULE:${rule}`);
    for (const date of event.exdates) {
      lines.push(
        event.all_day
          ? `EXDATE;VALUE=DATE:${compactDate(date)}`
          : `EXDATE;TZID=${timeZone}:${compactLocal(date, event.start_time as string)}`
      );
    }
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(events: CalendarEvent[], timeZone: string, stamp: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//My Schedule Manager//EN",
    "CALSCALE:GREGORIAN",
    ...events.flatMap((event) => eventLines(event, timeZone, stamp)),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
