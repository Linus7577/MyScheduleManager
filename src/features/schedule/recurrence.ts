import { RRule } from "rrule";
import { addDays, daysBetween } from "./logic";
import type { CalendarEvent, EventFields, ScheduleErrorCode } from "./types";

const MAX_RULE_LENGTH = 300;
/** A year of a daily event, which is more than any calendar view can show. */
const MAX_OCCURRENCES = 400;
const ALLOWED_FREQUENCIES: number[] = [RRule.YEARLY, RRule.MONTHLY, RRule.WEEKLY, RRule.DAILY];
// Repeating several times a day would flood the calendar, and the rest of the standard can describe rules that
// never happen, which take the library seconds to give up on.
const ALLOWED_PARTS = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTH", "BYMONTHDAY", "BYSETPOS", "WKST"]);

/** Events store the owner's wall clock. Treating it as UTC keeps every date exactly as written. */
function floating(date: string, time?: string | null): Date {
  return new Date(`${date}T${time ?? "00:00"}:00Z`);
}

function toDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function buildRule(rule: string, start: Date): RRule | null {
  const text = rule.trim().replace(/^RRULE:/i, "");
  if (!text || text.length > MAX_RULE_LENGTH) return null;
  if (text.split(";").some((part) => !ALLOWED_PARTS.has(part.split("=")[0].toUpperCase()))) return null;
  try {
    const options = RRule.parseString(text);
    if (options.freq === undefined || !ALLOWED_FREQUENCIES.includes(options.freq)) return null;
    if (options.interval !== undefined && !(Number.isInteger(options.interval) && options.interval >= 1)) return null;
    return new RRule({ ...options, dtstart: start });
  } catch {
    return null;
  }
}

/** A rule is usable if it can be read and happens at least once. */
export function isUsableRule(rule: string, startDate: string, startTime?: string | null): boolean {
  const start = floating(startDate, startTime);
  const built = buildRule(rule, start);
  return built !== null && built.after(start, true) !== null;
}

export function checkRepeat(event: EventFields): ScheduleErrorCode | null {
  if (!event.rrule) return null;
  return isUsableRule(event.rrule, event.start_date, event.start_time) ? null : "badRepeat";
}

/** The dates this event starts on inside the range, including a stay that began before the range and runs into it. */
function occurrenceDates(event: CalendarEvent, from: string, to: string): string[] {
  const span = daysBetween(event.start_date, event.end_date);
  if (!event.rrule) return event.start_date <= to && event.end_date >= from ? [event.start_date] : [];

  const rule = buildRule(event.rrule, floating(event.start_date, event.start_time));
  if (!rule) return [];
  const skipped = new Set(event.exdates);
  return rule
    .between(floating(addDays(from, -span)), floating(to, "23:59"), true, (_, count) => count < MAX_OCCURRENCES)
    .map(toDate)
    .filter((date) => !skipped.has(date));
}

/** One showing of an event. `event` is always the stored row, which is what editing changes. */
export type Occurrence = { event: CalendarEvent; start_date: string; end_date: string };

export function expandEvents(events: CalendarEvent[], from: string, to: string): Occurrence[] {
  return events
    .flatMap((event) => {
      const span = daysBetween(event.start_date, event.end_date);
      return occurrenceDates(event, from, to).map((date) => ({
        event,
        start_date: date,
        end_date: addDays(date, span),
      }));
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** The next time this event happens from today on, or its first date if the series is over. */
export function nextOccurrence(event: CalendarEvent, today: string): string {
  if (!event.rrule) return event.start_date;
  const rule = buildRule(event.rrule, floating(event.start_date, event.start_time));
  if (!rule) return event.start_date;
  const skipped = new Set(event.exdates);
  let next = rule.after(floating(today), true);
  while (next && skipped.has(toDate(next))) next = rule.after(next, false);
  return next ? toDate(next) : event.start_date;
}
