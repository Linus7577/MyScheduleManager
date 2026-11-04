import type { Category } from "@/config/game.config";
import { logBlock, rescoreBlock, reverseBlock } from "@/features/game/service";
import { generateInstances, generateMissingInstances, type ScheduleContext } from "./generation";
import {
  activeTemplateId,
  addDays,
  canUndoRestDay,
  checkDeclareRest,
  checkDeclareShield,
  checkEvent,
  daysBetween,
  earnsXp,
  findInstanceOverlaps,
  generationEnd,
  restDaysUsedInWeek,
  shieldsUsedInMonth,
} from "./logic";
import { eventUid, parseIcs } from "./ics";
import { checkRepeat, expandEvents, nextOccurrence, type Occurrence } from "./recurrence";
import type {
  ActionResult,
  BlockFields,
  BlockInstance,
  EventFields,
  FeedItem,
  InstanceStatus,
  RestDay,
  RestKind,
  ScheduleErrorCode,
  TemplateBlock,
} from "./types";

export type { ScheduleContext };

const SEARCH_LIMIT = 20;

const OK: ActionResult = { ok: true };
const fail = (code: ScheduleErrorCode): ActionResult => ({ ok: false, code });

const REST_LOOKUP_DAYS = 45;

async function restDaysAround(ctx: ScheduleContext, date: string): Promise<RestDay[]> {
  return ctx.repo.listRestDays(addDays(date, -REST_LOOKUP_DAYS), addDays(date, REST_LOOKUP_DAYS));
}

/** Runs when a schedule page opens. Seeds the templates once, then generates any days not generated yet. */
export async function ensureLoopReady(ctx: ScheduleContext, seedNames: string[]): Promise<void> {
  const templates = await ctx.repo.listTemplates();
  if (templates.length === 0) {
    const created = [];
    for (const name of seedNames) created.push(await ctx.repo.createTemplate(name));
    await ctx.repo.upsertActivation(created[0].id, ctx.today);
  }
  await generateMissingInstances(ctx);
}

async function isDayClosed(ctx: ScheduleContext, date: string): Promise<boolean> {
  return (await ctx.repo.getClosedDay(date)) !== null;
}

/** Replaces unlogged, unedited template blocks from this date on. Anything you touched stays. */
async function regenerateFrom(ctx: ScheduleContext, from: string): Promise<void> {
  await ctx.repo.deleteRegenerableInstances(from);
  await generateInstances(ctx, from, generationEnd(ctx.today));
}

/* Templates */

export async function createTemplate(ctx: ScheduleContext, name: string): Promise<ActionResult> {
  await ctx.repo.createTemplate(name);
  return OK;
}

export async function renameTemplate(ctx: ScheduleContext, id: string, name: string): Promise<ActionResult> {
  await ctx.repo.renameTemplate(id, name);
  return OK;
}

export async function deleteTemplate(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  const activations = await ctx.repo.listActivations();
  const inUse =
    activeTemplateId(ctx.today, activations) === id ||
    activations.some((activation) => activation.template_id === id && activation.effective_from > ctx.today);
  if (inUse) return fail("templateInUse");

  await ctx.repo.deleteTemplate(id);
  return OK;
}

export async function switchTemplate(
  ctx: ScheduleContext,
  id: string,
  effectiveFrom: string
): Promise<ActionResult> {
  if (effectiveFrom < ctx.today) return fail("effectiveInPast");
  const templates = await ctx.repo.listTemplates();
  if (!templates.some((template) => template.id === id)) return fail("notFound");

  await ctx.repo.upsertActivation(id, effectiveFrom);
  await regenerateFrom(ctx, effectiveFrom);
  return OK;
}

export async function createBlock(ctx: ScheduleContext, block: Omit<TemplateBlock, "id">): Promise<ActionResult> {
  await ctx.repo.createBlock(block);
  await regenerateFrom(ctx, ctx.today);
  return OK;
}

export async function updateBlock(
  ctx: ScheduleContext,
  id: string,
  patch: BlockFields & { weekday: number }
): Promise<ActionResult> {
  if (!(await ctx.repo.getBlock(id))) return fail("notFound");
  await ctx.repo.updateBlock(id, patch);
  await regenerateFrom(ctx, ctx.today);
  return OK;
}

export async function deleteBlock(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  await ctx.repo.deleteRegenerableInstances(ctx.today);
  await ctx.repo.deleteBlock(id);
  await generateInstances(ctx, ctx.today, generationEnd(ctx.today));
  return OK;
}

/* Instances */

export async function logInstance(
  ctx: ScheduleContext,
  id: string,
  status: Exclude<InstanceStatus, "rest">,
  logNote: string
): Promise<ActionResult> {
  return logBlock(ctx, id, status, logNote);
}

/** Changes this day only, unless the owner explicitly also applies it to the template. */
export async function editInstance(
  ctx: ScheduleContext,
  id: string,
  fields: BlockFields,
  applyToTemplate: boolean
): Promise<ActionResult> {
  const instance = await ctx.repo.getInstance(id);
  if (!instance) return fail("notFound");
  if (instance.event_id) return fail("eventLinked");
  if (await isDayClosed(ctx, instance.date)) return fail("dayClosed");

  await ctx.repo.updateInstance(id, { ...fields, is_edited: true });
  await rescoreBlock(ctx, id);

  if (applyToTemplate && instance.template_block_id) {
    await ctx.repo.updateBlock(instance.template_block_id, fields);
    await regenerateFrom(ctx, ctx.today);
  }
  return OK;
}

/** Hidden rather than removed, so generation doesn't bring it back. */
export async function cancelInstance(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  const instance = await ctx.repo.getInstance(id);
  if (!instance) return fail("notFound");
  if (instance.event_id) return fail("eventLinked");
  if (instance.status !== "planned" && instance.status !== "rest") return fail("notCancellable");
  if (await isDayClosed(ctx, instance.date)) return fail("dayClosed");

  await ctx.repo.updateInstance(id, { is_cancelled: true, is_edited: true });
  return OK;
}

/* Rest Days and Shields */

async function declareDay(ctx: ScheduleContext, date: string, kind: RestKind): Promise<ActionResult> {
  const restDays = await restDaysAround(ctx, date);
  const problem =
    kind === "rest" ? checkDeclareRest(date, ctx.today, restDays) : checkDeclareShield(date, ctx.today, restDays);
  if (problem) return fail(problem);

  await ctx.repo.addRestDay(date, kind);
  // Done and partial blocks keep what they earned. A skipped block on a Shield day stops counting against you.
  await ctx.repo.setDayStatus(date, ["planned", "skipped"], "rest");
  return OK;
}

export const declareRestDay = (ctx: ScheduleContext, date: string) => declareDay(ctx, date, "rest");
export const declareShield = (ctx: ScheduleContext, date: string) => declareDay(ctx, date, "shield");

export async function undoRestDay(ctx: ScheduleContext, date: string): Promise<ActionResult> {
  const [day] = await ctx.repo.listRestDays(date, date);
  if (!day) return fail("notFound");
  if (!canUndoRestDay(day, ctx.today)) return fail("cannotUndo");

  await ctx.repo.deleteRestDay(date);
  await ctx.repo.setDayStatus(date, ["rest"], "planned");
  return OK;
}

/* One-off events */

function eventInstanceFields(event: EventFields): BlockFields & { date: string } {
  return {
    date: event.start_date,
    start_time: event.start_time as string,
    end_time: event.end_time as string,
    category: event.category,
    title: event.title,
    notes: event.notes,
  };
}

export async function createEvent(ctx: ScheduleContext, event: EventFields): Promise<ActionResult> {
  const problem = checkEvent(event) ?? checkRepeat(event);
  if (problem) return fail(problem);
  if (earnsXp(event) && (await isDayClosed(ctx, event.start_date))) return fail("dayClosed");

  const created = await ctx.repo.createEvent(event);
  if (earnsXp(event)) {
    const [restDay] = await ctx.repo.listRestDays(event.start_date, event.start_date);
    await ctx.repo.insertInstances([
      {
        ...eventInstanceFields(event),
        status: restDay ? "rest" : "planned",
        template_block_id: null,
        event_id: created.id,
      },
    ]);
  }
  return OK;
}

export async function updateEvent(ctx: ScheduleContext, id: string, event: EventFields): Promise<ActionResult> {
  const problem = checkEvent(event) ?? checkRepeat(event);
  if (problem) return fail(problem);
  if (!(await ctx.repo.getEvent(id))) return fail("notFound");

  const linked = await ctx.repo.getInstanceByEvent(id);
  // A closed day's block has been counted, and the date it would move to may be closed as well.
  if (linked && (await isDayClosed(ctx, linked.date))) return fail("dayClosed");
  if (earnsXp(event) && (await isDayClosed(ctx, event.start_date))) return fail("dayClosed");

  await ctx.repo.updateEvent(id, event);

  if (!earnsXp(event)) {
    if (linked) {
      await reverseBlock(ctx, linked);
      await ctx.repo.deleteInstance(linked.id);
    }
    return OK;
  }
  if (linked) {
    await ctx.repo.updateInstance(linked.id, eventInstanceFields(event));
    await rescoreBlock(ctx, linked.id);
    return OK;
  }
  await ctx.repo.insertInstances([
    { ...eventInstanceFields(event), status: "planned", template_block_id: null, event_id: id },
  ]);
  return OK;
}

export async function deleteEvent(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  const linked = await ctx.repo.getInstanceByEvent(id);
  if (linked) {
    if (await isDayClosed(ctx, linked.date)) return fail("dayClosed");
    await reverseBlock(ctx, linked);
  }
  await ctx.repo.deleteEvent(id);
  return OK;
}

/** Takes one date out of a repeating event and leaves the rest of the series. */
export async function skipOccurrence(ctx: ScheduleContext, id: string, date: string): Promise<ActionResult> {
  const event = await ctx.repo.getEvent(id);
  if (!event) return fail("notFound");
  if (!event.rrule) return fail("invalid");
  await ctx.repo.updateEvent(id, { exdates: [...new Set([...event.exdates, date])] });
  return OK;
}

export type CalendarImportResult =
  | { ok: true; added: number; duplicates: number; skipped: number; repeatsDropped: number }
  | { ok: false; code: ScheduleErrorCode };

/** Adds a calendar file's events as plain events. Importing the same file twice adds nothing the second time. */
export async function importCalendar(
  ctx: ScheduleContext & { timeZone: string },
  text: string,
  untitled: string
): Promise<CalendarImportResult> {
  const parsed = parseIcs(text, { timeZone: ctx.timeZone, untitled });
  if (!parsed) return { ok: false, code: "badCalendarFile" };

  const known = new Set((await ctx.repo.listAllEvents()).map(eventUid));
  const fresh = parsed.events.filter((event) => !event.ics_uid || !known.has(event.ics_uid));
  await ctx.repo.importEvents(fresh);
  return {
    ok: true,
    added: fresh.length,
    duplicates: parsed.events.length - fresh.length,
    skipped: parsed.skipped,
    repeatsDropped: parsed.repeatsDropped,
  };
}

/* Reading */

export type DayView = {
  date: string;
  instances: BlockInstance[];
  overlaps: Set<string>;
  restDay: RestDay | null;
  restDaysUsed: number;
  shieldsUsed: number;
};

export async function getDayView(ctx: ScheduleContext, date: string): Promise<DayView> {
  // The neighbouring days matter because a block crossing midnight can overlap the next morning.
  const [nearby, restDays] = await Promise.all([
    ctx.repo.listInstances(addDays(date, -1), addDays(date, 1)),
    restDaysAround(ctx, date),
  ]);
  const visible = nearby.filter((instance) => !instance.is_cancelled);
  return {
    date,
    instances: visible.filter((instance) => instance.date === date),
    overlaps: findInstanceOverlaps(visible),
    restDay: restDays.find((day) => day.date === date) ?? null,
    restDaysUsed: restDaysUsedInWeek(date, restDays),
    shieldsUsed: shieldsUsedInMonth(date, restDays),
  };
}

function eventEnd({ event, end_date }: Occurrence): string {
  // The calendar treats an all-day end date as exclusive, while events store the last day itself.
  return event.all_day ? addDays(end_date, 1) : `${end_date}T${event.end_time}:00`;
}

export async function getCalendarFeed(ctx: ScheduleContext, from: string, to: string): Promise<FeedItem[]> {
  const [instances, events, tasks, projects] = await Promise.all([
    ctx.repo.listInstances(from, to),
    ctx.repo.listEvents(from, to),
    ctx.repo.listTasksDue(from, to),
    ctx.repo.listProjects(),
  ]);
  const statusByEvent = new Map(
    instances.filter((instance) => instance.event_id).map((instance) => [instance.event_id, instance.status])
  );

  const blockItems: FeedItem[] = instances
    .filter((instance) => !instance.is_cancelled && !instance.event_id)
    .map((instance) => {
      const endDate = instance.end_time <= instance.start_time ? addDays(instance.date, 1) : instance.date;
      return {
        id: `block-${instance.id}`,
        kind: "block",
        link: `/loop?date=${instance.date}`,
        title: instance.title,
        category: instance.category,
        status: instance.status,
        all_day: false,
        start: `${instance.date}T${instance.start_time}:00`,
        end: `${endDate}T${instance.end_time}:00`,
        date: instance.date,
        event: null,
      };
    });

  const eventItems: FeedItem[] = expandEvents(events, from, to).map((occurrence) => {
    const { event, start_date } = occurrence;
    return {
      id: event.rrule ? `event-${event.id}-${start_date}` : `event-${event.id}`,
      kind: "event",
      link: null,
      title: event.title,
      category: event.category,
      status: statusByEvent.get(event.id) ?? null,
      all_day: event.all_day,
      start: event.all_day ? start_date : `${start_date}T${event.start_time}:00`,
      end: eventEnd(occurrence),
      date: start_date,
      event,
    };
  });

  const goalByProject = new Map(projects.map((project) => [project.id, project.goal_id]));
  const taskItems: FeedItem[] = tasks
    .filter((task) => task.status !== "done" && task.due_date)
    .map((task) => ({
      id: `task-${task.id}`,
      kind: "task",
      link: `/goals/${goalByProject.get(task.project_id)}`,
      title: task.title,
      category: task.category,
      status: null,
      all_day: true,
      start: task.due_date as string,
      end: addDays(task.due_date as string, 1),
      date: task.due_date as string,
      event: null,
    }));

  return [...blockItems, ...eventItems, ...taskItems];
}

export type CalendarHit = { id: string; kind: "event" | "block"; title: string; category: Category; date: string };

/** The closest matches to today come first, so a block done every day shows this week's rather than last year's. */
export async function searchCalendar(ctx: ScheduleContext, query: string): Promise<CalendarHit[]> {
  const [events, instances] = await Promise.all([
    ctx.repo.searchEvents(query, SEARCH_LIMIT),
    ctx.repo.searchInstances(query, SEARCH_LIMIT),
  ]);
  const hits: CalendarHit[] = [
    ...events.map((event) => ({
      id: `event-${event.id}`,
      kind: "event" as const,
      title: event.title,
      category: event.category,
      date: nextOccurrence(event, ctx.today),
    })),
    ...instances
      .filter((instance) => !instance.event_id)
      .map((instance) => ({
        id: `block-${instance.id}`,
        kind: "block" as const,
        title: instance.title,
        category: instance.category,
        date: instance.date,
      })),
  ];
  const distance = (hit: CalendarHit) => Math.abs(daysBetween(ctx.today, hit.date));
  return hits.sort((a, b) => distance(a) - distance(b)).slice(0, SEARCH_LIMIT);
}

export async function getTemplatesView(ctx: ScheduleContext) {
  const [templates, activations, blocks] = await Promise.all([
    ctx.repo.listTemplates(),
    ctx.repo.listActivations(),
    ctx.repo.listBlocks(),
  ]);
  const upcoming = activations
    .filter((activation) => activation.effective_from > ctx.today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));

  return {
    activeId: activeTemplateId(ctx.today, activations),
    upcoming,
    templates: templates.map((template) => ({
      ...template,
      blockCount: blocks.filter((block) => block.template_id === template.id).length,
    })),
  };
}

export async function getTemplateEditor(ctx: ScheduleContext, id: string) {
  const [templates, blocks] = await Promise.all([ctx.repo.listTemplates(), ctx.repo.listBlocks()]);
  const template = templates.find((candidate) => candidate.id === id);
  if (!template) return null;
  return {
    template,
    blocks: blocks
      .filter((block) => block.template_id === id)
      .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)),
  };
}
