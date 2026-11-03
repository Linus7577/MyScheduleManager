import { isProductive } from "@/config/game.config";
import { countedMinutesFor } from "@/features/game/scoring";
import { addDays, datesBetween, durationMinutes, weekStart } from "@/features/schedule/logic";
import type { BlockInstance } from "@/features/schedule/types";
import {
  WIDGET_IDS,
  type DashboardDevice,
  type Goal,
  type HabitCheckin,
  type LearningUnit,
  type ProgressSnapshot,
  type Project,
  type Task,
  type WidgetId,
  type WidgetSetting,
  type WidgetState,
} from "./types";

/* Progress */

const average = (values: number[]) =>
  values.length === 0 ? 0 : Math.round(values.reduce((total, value) => total + value, 0) / values.length);

/** Done tasks out of all tasks, or the number the owner set by hand. A project marked done is always 100. */
export function projectPercent(project: Project, tasks: Task[]): number {
  if (project.status === "done") return 100;
  if (project.progress_mode === "manual") return project.manual_percent;
  const own = tasks.filter((task) => task.project_id === project.id);
  if (own.length === 0) return 0;
  return Math.round((own.filter((task) => task.status === "done").length / own.length) * 100);
}

/** The average of the goal's projects. Paused projects are left out, so pausing one doesn't drag the goal down. */
export function goalPercent(goal: Goal, projects: Project[], tasks: Task[]): number {
  if (goal.status === "done") return 100;
  const own = projects.filter((project) => project.goal_id === goal.id && project.status !== "paused");
  return average(own.map((project) => projectPercent(project, tasks)));
}

export function trackPercent(trackId: string, units: LearningUnit[]): number {
  return average(units.filter((unit) => unit.track_id === trackId).map((unit) => unit.percent));
}

export function buildSnapshots(input: {
  today: string;
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  trackIds: string[];
  units: LearningUnit[];
}): ProgressSnapshot[] {
  const { today, goals, projects, tasks, trackIds, units } = input;
  return [
    ...goals.map((goal) => ({
      date: today,
      entity_type: "goal" as const,
      entity_id: goal.id,
      percent: goalPercent(goal, projects, tasks),
    })),
    ...projects.map((project) => ({
      date: today,
      entity_type: "project" as const,
      entity_id: project.id,
      percent: projectPercent(project, tasks),
    })),
    ...trackIds.map((id) => ({
      date: today,
      entity_type: "track" as const,
      entity_id: id,
      percent: trackPercent(id, units),
    })),
  ];
}

/* Habits */

export function checkinsThisWeek(habitId: string, checkins: HabitCheckin[], today: string): number {
  const start = weekStart(today);
  return checkins.filter((checkin) => checkin.habit_id === habitId && checkin.date >= start && checkin.date <= today)
    .length;
}

export type HabitStreak = { value: number; unit: "days" | "weeks" };

/**
 * A daily habit (7 times a week) counts days in a row. Anything less often counts weeks in a row that reached
 * the target. Today and this week can still be completed, so unfinished ones don't break the streak.
 */
export function habitStreak(
  habit: { id: string; target_per_week: number },
  checkins: HabitCheckin[],
  today: string
): HabitStreak {
  const dates = new Set(checkins.filter((checkin) => checkin.habit_id === habit.id).map((checkin) => checkin.date));

  if (habit.target_per_week >= 7) {
    let value = 0;
    let cursor = dates.has(today) ? today : addDays(today, -1);
    while (dates.has(cursor)) {
      value += 1;
      cursor = addDays(cursor, -1);
    }
    return { value, unit: "days" };
  }

  const countInWeek = (start: string) =>
    datesBetween(start, addDays(start, 6)).filter((date) => dates.has(date)).length;

  let value = 0;
  let cursor = weekStart(today);
  if (countInWeek(cursor) >= habit.target_per_week) value += 1;
  cursor = addDays(cursor, -7);
  while (countInWeek(cursor) >= habit.target_per_week) {
    value += 1;
    cursor = addDays(cursor, -7);
  }
  return { value, unit: "weeks" };
}

/** Columns of Monday-to-Sunday dates, oldest first, ending with the current week. */
export function heatmapWeeks(today: string, weeks: number): string[][] {
  const lastStart = weekStart(today);
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(lastStart, (index - weeks + 1) * 7);
    return datesBetween(start, addDays(start, 6));
  });
}

/* Stats from blocks */

const earnedShare = (status: string) => (status === "done" ? 1 : status === "partial" ? 0.5 : 0);

export type DayStat = { date: string; planned: number; done: number };

/** Planned against done minutes for each date. A partial block counts as half, the same as in the streak rule. */
export function dailyStats(dates: string[], instances: BlockInstance[]): DayStat[] {
  return dates.map((date) => {
    const day = instances.filter((block) => block.date === date && !block.is_cancelled);
    const counted = countedMinutesFor(day);
    let planned = 0;
    let done = 0;
    for (const block of day) {
      if (!isProductive(block.category) || block.status === "rest") continue;
      const minutes = counted.get(block.id) ?? 0;
      planned += minutes;
      done += minutes * earnedShare(block.status);
    }
    return { date, planned, done: Math.round(done) };
  });
}

export type TrackWeek = { weekStart: string; minutes: Record<string, number> };

/** Minutes studied per track, per week, oldest first. Only blocks tagged with a track count. */
export function studyMinutesByWeek(instances: BlockInstance[], today: string, weeks: number): TrackWeek[] {
  const start = weekStart(today);
  const result: TrackWeek[] = Array.from({ length: weeks }, (_, index) => ({
    weekStart: addDays(start, (index - weeks + 1) * 7),
    minutes: {},
  }));
  for (const block of instances) {
    if (!block.track_id || block.is_cancelled) continue;
    const share = earnedShare(block.status);
    if (share === 0) continue;
    const week = result.find((entry) => entry.weekStart === weekStart(block.date));
    if (!week) continue;
    const minutes = durationMinutes(block.start_time, block.end_time) * share;
    week.minutes[block.track_id] = Math.round((week.minutes[block.track_id] ?? 0) + minutes);
  }
  return result;
}

/* Dashboard */

const DEFAULT_STATES: Record<WidgetId, WidgetState> = {
  goals: "open",
  today: "collapsed",
  learning: "collapsed",
  habits: "collapsed",
  spending: "collapsed",
  portfolio: "collapsed",
  oracle: "collapsed",
  events: "collapsed",
  weekly: "collapsed",
};

export function defaultLayout(): WidgetSetting[] {
  return WIDGET_IDS.map((id) => ({ id, state: DEFAULT_STATES[id] }));
}

/** Keeps a saved layout valid as widgets are added or removed in future versions. */
export function normalizeLayout(saved: WidgetSetting[] | null): WidgetSetting[] {
  if (!saved) return defaultLayout();
  const known = saved.filter((setting) => (WIDGET_IDS as readonly string[]).includes(setting.id));
  const unique = known.filter((setting, index) => known.findIndex((other) => other.id === setting.id) === index);
  const missing = defaultLayout().filter((setting) => !unique.some((other) => other.id === setting.id));
  return [...unique, ...missing];
}

export function moveWidget(layout: WidgetSetting[], id: WidgetId, direction: -1 | 1): WidgetSetting[] {
  const index = layout.findIndex((setting) => setting.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layout.length) return layout;
  const next = [...layout];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export type { DashboardDevice };
