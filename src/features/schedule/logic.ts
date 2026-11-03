import { isProductive, REST_DAYS_PER_WEEK, SHIELDS_PER_MONTH } from "@/config/game.config";
import type {
  EventFields,
  NewInstance,
  RestDay,
  ScheduleErrorCode,
  TemplateActivation,
  TemplateBlock,
} from "./types";

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const MS_PER_DAY = 86_400_000;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
}

export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 1 is Monday and 7 is Sunday. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekDates(date: string): string[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Generation always reaches the end of next week. */
export function generationEnd(today: string): string {
  return addDays(weekStart(today), 13);
}

export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** A block ending at or before its start time runs past midnight and belongs to its start date. */
export function crossesMidnight(start: string, end: string): boolean {
  return toMinutes(end) <= toMinutes(start);
}

export function durationMinutes(start: string, end: string): number {
  const difference = toMinutes(end) - toMinutes(start);
  return difference > 0 ? difference : difference + MINUTES_PER_DAY;
}

export function activeTemplateId(date: string, activations: TemplateActivation[]): string | null {
  let latest: TemplateActivation | null = null;
  for (const activation of activations) {
    if (activation.effective_from > date) continue;
    if (!latest || activation.effective_from > latest.effective_from) latest = activation;
  }
  return latest?.template_id ?? null;
}

export function buildInstanceRows(input: {
  from: string;
  to: string;
  activations: TemplateActivation[];
  blocks: TemplateBlock[];
  restDates: Set<string>;
}): NewInstance[] {
  const rows: NewInstance[] = [];
  for (const date of datesBetween(input.from, input.to)) {
    const templateId = activeTemplateId(date, input.activations);
    if (!templateId) continue;
    const weekday = isoWeekday(date);
    for (const block of input.blocks) {
      if (block.template_id !== templateId || block.weekday !== weekday) continue;
      rows.push({
        date,
        start_time: block.start_time,
        end_time: block.end_time,
        category: block.category,
        title: block.title,
        notes: block.notes,
        status: input.restDates.has(date) ? "rest" : "planned",
        template_block_id: block.id,
        event_id: null,
      });
    }
  }
  return rows;
}

type Interval = { id: string; start: number; end: number };

function overlappingIds(intervals: Interval[]): Set<string> {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const overlapping = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
      if (sorted[i].id === sorted[j].id) continue;
      overlapping.add(sorted[i].id);
      overlapping.add(sorted[j].id);
    }
  }
  return overlapping;
}

/** Touching blocks don't overlap: one ending at 10:00 and one starting at 10:00 are fine. */
export function findInstanceOverlaps(
  instances: { id: string; date: string; start_time: string; end_time: string }[]
): Set<string> {
  return overlappingIds(
    instances.map((instance) => {
      const start = dayNumber(instance.date) * MINUTES_PER_DAY + toMinutes(instance.start_time);
      return { id: instance.id, start, end: start + durationMinutes(instance.start_time, instance.end_time) };
    })
  );
}

/** The week wraps around, so a Sunday night block can run into a Monday morning block. */
export function findTemplateOverlaps(
  blocks: { id: string; weekday: number; start_time: string; end_time: string }[]
): Set<string> {
  const intervals: Interval[] = [];
  for (const block of blocks) {
    const start = (block.weekday - 1) * MINUTES_PER_DAY + toMinutes(block.start_time);
    const end = start + durationMinutes(block.start_time, block.end_time);
    intervals.push({ id: block.id, start, end });
    if (end > MINUTES_PER_WEEK) intervals.push({ id: block.id, start: 0, end: end - MINUTES_PER_WEEK });
  }
  return overlappingIds(intervals);
}

export function restDaysUsedInWeek(date: string, restDays: RestDay[]): number {
  const start = weekStart(date);
  const end = addDays(start, 6);
  return restDays.filter((day) => day.kind === "rest" && day.date >= start && day.date <= end).length;
}

export function shieldsUsedInMonth(date: string, restDays: RestDay[]): number {
  const month = date.slice(0, 7);
  return restDays.filter((day) => day.kind === "shield" && day.date.startsWith(month)).length;
}

export function checkDeclareRest(date: string, today: string, restDays: RestDay[]): ScheduleErrorCode | null {
  if (date <= today) return "restMustBeFuture";
  if (restDays.some((day) => day.date === date)) return "dayAlreadyDeclared";
  if (restDaysUsedInWeek(date, restDays) >= REST_DAYS_PER_WEEK) return "restLimit";
  return null;
}

export function checkDeclareShield(date: string, today: string, restDays: RestDay[]): ScheduleErrorCode | null {
  if (date < today) return "shieldInPast";
  if (restDays.some((day) => day.date === date)) return "dayAlreadyDeclared";
  if (shieldsUsedInMonth(date, restDays) >= SHIELDS_PER_MONTH) return "shieldLimit";
  return null;
}

/** A Rest Day can be taken back until its day starts, and a Shield until its day ends. */
export function canUndoRestDay(day: RestDay, today: string): boolean {
  return day.kind === "rest" ? day.date > today : day.date >= today;
}

/**
 * A productive event earns XP like a block, so it needs a real duration on one date.
 * All-day and multi-day events are only allowed for the "other" category.
 */
export function checkEvent(event: EventFields): ScheduleErrorCode | null {
  if (event.end_date < event.start_date) return "eventEndBeforeStart";
  if (event.all_day) {
    if (event.start_time !== null || event.end_time !== null) return "invalid";
    return isProductive(event.category) ? "eventProductiveTimed" : null;
  }
  if (event.start_time === null || event.end_time === null) return "invalid";
  if (event.start_date === event.end_date && toMinutes(event.end_time) <= toMinutes(event.start_time)) {
    return "eventEndBeforeStart";
  }
  if (isProductive(event.category) && event.start_date !== event.end_date) return "eventProductiveTimed";
  return null;
}
