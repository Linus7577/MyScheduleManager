import type { ScheduleContext } from "@/features/schedule/generation";
import { addDays, weekDates, weekStart } from "@/features/schedule/logic";
import type { ActionResult } from "@/features/schedule/types";
import { buildSnapshots, dailyStats, goalPercent, normalizeLayout, projectPercent, studyMinutesByWeek, trackPercent } from "./logic";
import type { DashboardDevice, HabitCheckin, Task, TaskFields, UnitFields, WidgetSetting } from "./types";

const OK: ActionResult = { ok: true };

export const STUDY_CHART_WEEKS = 8;
export const HEATMAP_WEEKS = 14;
export const UPCOMING_DAYS = 7;

/** Records today's progress for charts. Safe to repeat: a day's values are simply replaced. */
export async function recordProgressSnapshots(ctx: ScheduleContext): Promise<void> {
  const [goals, projects, tasks, tracks, units] = await Promise.all([
    ctx.repo.listGoals(),
    ctx.repo.listProjects(),
    ctx.repo.listTasks(),
    ctx.repo.listTracks(),
    ctx.repo.listUnits(),
  ]);
  const snapshots = buildSnapshots({
    today: ctx.today,
    goals,
    projects,
    tasks,
    trackIds: tracks.map((track) => track.id),
    units,
  });
  if (snapshots.length > 0) await ctx.repo.upsertSnapshots(snapshots);
}

/* Goals */

export async function getGoalsView(ctx: ScheduleContext) {
  const [goals, projects, tasks] = await Promise.all([
    ctx.repo.listGoals(),
    ctx.repo.listProjects(),
    ctx.repo.listTasks(),
  ]);
  return goals.map((goal) => ({
    ...goal,
    percent: goalPercent(goal, projects, tasks),
    projectCount: projects.filter((project) => project.goal_id === goal.id).length,
  }));
}

export async function getGoalDetail(ctx: ScheduleContext, id: string) {
  const [goals, projects, tasks, tracks] = await Promise.all([
    ctx.repo.listGoals(),
    ctx.repo.listProjects(),
    ctx.repo.listTasks(),
    ctx.repo.listTracks(),
  ]);
  const goal = goals.find((candidate) => candidate.id === id);
  if (!goal) return null;

  const own = projects.filter((project) => project.goal_id === id);
  const snapshots = await ctx.repo.listSnapshots("goal", [id]);
  return {
    goal,
    percent: goalPercent(goal, projects, tasks),
    projects: own.map((project) => ({
      ...project,
      percent: projectPercent(project, tasks),
      tasks: tasks.filter((task) => task.project_id === project.id),
    })),
    tracks,
    history: snapshots.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function toggleTaskDone(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  const task = (await ctx.repo.listTasks()).find((candidate) => candidate.id === id);
  if (!task) return { ok: false, code: "notFound" };
  const next: TaskFields = {
    project_id: task.project_id,
    title: task.title,
    due_date: task.due_date,
    estimate_minutes: task.estimate_minutes,
    category: task.category,
    track_id: task.track_id,
    status: task.status === "done" ? "todo" : "done",
  };
  await ctx.repo.updateTask(id, next);
  return OK;
}

/* Learning */

export async function getLearningView(ctx: ScheduleContext) {
  const [tracks, units, instances] = await Promise.all([
    ctx.repo.listTracks(),
    ctx.repo.listUnits(),
    ctx.repo.listInstances(addDays(weekStart(ctx.today), -(STUDY_CHART_WEEKS - 1) * 7), ctx.today),
  ]);
  return {
    tracks: tracks.map((track) => ({
      ...track,
      percent: trackPercent(track.id, units),
      unitCount: units.filter((unit) => unit.track_id === track.id).length,
    })),
    studyWeeks: studyMinutesByWeek(instances, ctx.today, STUDY_CHART_WEEKS),
  };
}

export async function getTrackDetail(ctx: ScheduleContext, id: string) {
  const [tracks, units] = await Promise.all([ctx.repo.listTracks(), ctx.repo.listUnits()]);
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) return null;
  const snapshots = await ctx.repo.listSnapshots("track", [id]);
  return {
    track,
    percent: trackPercent(id, units),
    units: units.filter((unit) => unit.track_id === id).sort((a, b) => a.position - b.position),
    history: snapshots.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function addUnit(ctx: ScheduleContext, fields: Omit<UnitFields, "position">): Promise<ActionResult> {
  const units = (await ctx.repo.listUnits()).filter((unit) => unit.track_id === fields.track_id);
  const position = units.reduce((highest, unit) => Math.max(highest, unit.position + 1), 0);
  await ctx.repo.createUnit({ ...fields, position });
  return OK;
}

/* Habits */

export async function getHabitsView(ctx: ScheduleContext) {
  const from = addDays(weekStart(ctx.today), -(HEATMAP_WEEKS - 1) * 7);
  const [habits, checkins] = await Promise.all([ctx.repo.listHabits(), ctx.repo.listCheckins(from, ctx.today)]);
  return { habits, checkins, from };
}

/** A check-in can be added or removed for today or any past day, but not ahead of time. */
export async function toggleCheckin(ctx: ScheduleContext, habitId: string, date: string): Promise<ActionResult> {
  if (date > ctx.today) return { ok: false, code: "checkinInFuture" };
  const existing: HabitCheckin[] = await ctx.repo.listCheckins(date, date);
  if (existing.some((checkin) => checkin.habit_id === habitId)) await ctx.repo.removeCheckin(habitId, date);
  else await ctx.repo.addCheckin(habitId, date);
  return OK;
}

/* Dashboard */

export async function getDashboardLayouts(ctx: ScheduleContext) {
  const [mobile, desktop] = await Promise.all([ctx.repo.getWidgetLayout("mobile"), ctx.repo.getWidgetLayout("desktop")]);
  return { mobile: normalizeLayout(mobile), desktop: normalizeLayout(desktop) };
}

export async function saveDashboardLayout(
  ctx: ScheduleContext,
  device: DashboardDevice,
  layout: WidgetSetting[]
): Promise<ActionResult> {
  await ctx.repo.saveWidgetLayout(device, normalizeLayout(layout));
  return OK;
}

export async function getWeeklyStats(ctx: ScheduleContext) {
  const dates = weekDates(ctx.today);
  const instances = await ctx.repo.listInstances(dates[0], dates[6]);
  return dailyStats(dates, instances);
}

export async function getUpcoming(ctx: ScheduleContext) {
  const end = addDays(ctx.today, UPCOMING_DAYS);
  const [events, tasks] = await Promise.all([ctx.repo.listEvents(ctx.today, end), ctx.repo.listTasksDue(ctx.today, end)]);
  const openTasks: Task[] = tasks.filter((task) => task.status !== "done");
  return {
    events: events.sort((a, b) => a.start_date.localeCompare(b.start_date)),
    tasks: openTasks.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
  };
}
