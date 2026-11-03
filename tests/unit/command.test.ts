import { beforeEach, describe, expect, it } from "vitest";
import {
  buildSnapshots,
  checkinsThisWeek,
  dailyStats,
  defaultLayout,
  goalPercent,
  habitStreak,
  heatmapWeeks,
  moveWidget,
  normalizeLayout,
  projectPercent,
  studyMinutesByWeek,
  trackPercent,
} from "@/features/command/logic";
import * as command from "@/features/command/service";
import type { Goal, HabitCheckin, LearningUnit, Project, Task, WidgetSetting } from "@/features/command/types";
import type { AppRepo, ScheduleContext } from "@/features/schedule/generation";
import { createMemoryRepo } from "@/features/schedule/memory-repo";
import * as schedule from "@/features/schedule/service";
import type { BlockInstance } from "@/features/schedule/types";

// 2026-11-03 is a Tuesday.
const TODAY = "2026-11-03";

const project = (patch: Partial<Project> = {}): Project => ({
  id: "p1",
  goal_id: "g1",
  title: "Project",
  status: "active",
  progress_mode: "tasks",
  manual_percent: 0,
  ...patch,
});

const task = (id: string, status: Task["status"], project_id = "p1"): Task => ({
  id,
  project_id,
  title: id,
  due_date: null,
  status,
  estimate_minutes: null,
  category: "other",
  track_id: null,
});

const goal = (patch: Partial<Goal> = {}): Goal => ({
  id: "g1",
  title: "Goal",
  why: "",
  target_date: null,
  status: "active",
  created_at: "",
  ...patch,
});

const block = (patch: Partial<BlockInstance>): BlockInstance => ({
  id: crypto.randomUUID(),
  date: TODAY,
  start_time: "09:00",
  end_time: "10:00",
  category: "study",
  title: "Block",
  notes: "",
  status: "planned",
  log_note: "",
  logged_at: null,
  template_block_id: null,
  event_id: null,
  is_edited: false,
  is_cancelled: false,
  focus_broken_count: 0,
  ...patch,
});

describe("progress", () => {
  it("computes a project from its tasks", () => {
    const tasks = [task("a", "done"), task("b", "doing"), task("c", "todo"), task("d", "done")];
    expect(projectPercent(project(), tasks)).toBe(50);
  });

  it("is 0 with no tasks, and ignores other projects' tasks", () => {
    expect(projectPercent(project(), [])).toBe(0);
    expect(projectPercent(project(), [task("a", "done", "other")])).toBe(0);
  });

  it("uses the number set by hand in manual mode", () => {
    expect(projectPercent(project({ progress_mode: "manual", manual_percent: 35 }), [task("a", "done")])).toBe(35);
  });

  it("is 100 once a project is marked done", () => {
    expect(projectPercent(project({ status: "done" }), [task("a", "todo")])).toBe(100);
  });

  it("averages a goal's projects, leaving out paused ones", () => {
    const projects = [
      project({ id: "a", progress_mode: "manual", manual_percent: 100 }),
      project({ id: "b", progress_mode: "manual", manual_percent: 50 }),
      project({ id: "c", status: "paused", progress_mode: "manual", manual_percent: 0 }),
    ];
    expect(goalPercent(goal(), projects, [])).toBe(75);
  });

  it("is 100 once a goal is marked done, and 0 with no projects", () => {
    expect(goalPercent(goal({ status: "done" }), [], [])).toBe(100);
    expect(goalPercent(goal(), [], [])).toBe(0);
  });

  it("averages a track's units", () => {
    const units: LearningUnit[] = [
      { id: "1", track_id: "t", title: "1", position: 0, percent: 100 },
      { id: "2", track_id: "t", title: "2", position: 1, percent: 50 },
      { id: "3", track_id: "other", title: "3", position: 0, percent: 0 },
    ];
    expect(trackPercent("t", units)).toBe(75);
    expect(trackPercent("empty", units)).toBe(0);
  });

  it("snapshots every goal, project and track", () => {
    const snapshots = buildSnapshots({
      today: TODAY,
      goals: [goal()],
      projects: [project()],
      tasks: [task("a", "done")],
      trackIds: ["t"],
      units: [],
    });
    expect(snapshots.map((snapshot) => [snapshot.entity_type, snapshot.percent])).toEqual([
      ["goal", 100],
      ["project", 100],
      ["track", 0],
    ]);
  });
});

describe("habits", () => {
  const checkins = (...dates: string[]): HabitCheckin[] => dates.map((date) => ({ habit_id: "h", date }));

  it("counts this week's check-ins from Monday", () => {
    expect(checkinsThisWeek("h", checkins("2026-11-01", "2026-11-02", "2026-11-03"), TODAY)).toBe(2);
    expect(checkinsThisWeek("other", checkins("2026-11-02"), TODAY)).toBe(0);
  });

  it("counts days in a row for a daily habit", () => {
    const daily = { id: "h", target_per_week: 7 };
    expect(habitStreak(daily, checkins("2026-11-01", "2026-11-02", "2026-11-03"), TODAY)).toEqual({ value: 3, unit: "days" });
  });

  it("doesn't break a daily streak just because today isn't done yet", () => {
    const daily = { id: "h", target_per_week: 7 };
    expect(habitStreak(daily, checkins("2026-11-01", "2026-11-02"), TODAY).value).toBe(2);
    expect(habitStreak(daily, checkins("2026-11-01"), TODAY).value).toBe(0);
  });

  it("counts weeks that reached the target for a less-than-daily habit", () => {
    const weekly = { id: "h", target_per_week: 2 };
    const history = checkins("2026-10-19", "2026-10-20", "2026-10-26", "2026-10-27", "2026-11-02");
    // Two full weeks reached it. This week has one of two so far, which neither adds nor breaks.
    expect(habitStreak(weekly, history, TODAY)).toEqual({ value: 2, unit: "weeks" });
  });

  it("adds the current week once it reaches the target", () => {
    const weekly = { id: "h", target_per_week: 2 };
    const history = checkins("2026-10-26", "2026-10-27", "2026-11-02", "2026-11-03");
    expect(habitStreak(weekly, history, TODAY).value).toBe(2);
  });

  it("breaks on a missed week", () => {
    const weekly = { id: "h", target_per_week: 1 };
    expect(habitStreak(weekly, checkins("2026-10-12"), TODAY).value).toBe(0);
  });

  it("builds heatmap weeks ending with the current one", () => {
    const weeks = heatmapWeeks(TODAY, 3);
    expect(weeks).toHaveLength(3);
    expect(weeks[0][0]).toBe("2026-10-19");
    expect(weeks[2][0]).toBe("2026-11-02");
    expect(weeks[2][6]).toBe("2026-11-08");
  });
});

describe("stats from blocks", () => {
  it("adds up planned and done minutes, with partial as half", () => {
    const stats = dailyStats(
      [TODAY],
      [
        block({ status: "done" }),
        block({ status: "partial", start_time: "11:00", end_time: "12:00" }),
        block({ status: "skipped", start_time: "13:00", end_time: "14:00" }),
      ]
    );
    expect(stats).toEqual([{ date: TODAY, planned: 180, done: 90 }]);
  });

  it("leaves out rest, cancelled and 'other' blocks", () => {
    const stats = dailyStats(
      [TODAY],
      [block({ status: "rest" }), block({ is_cancelled: true }), block({ category: "other", status: "done" })]
    );
    expect(stats[0]).toEqual({ date: TODAY, planned: 0, done: 0 });
  });

  it("applies the YouTube cap", () => {
    const stats = dailyStats([TODAY], [block({ category: "useful_youtube", end_time: "11:00", status: "done" })]);
    expect(stats[0]).toEqual({ date: TODAY, planned: 60, done: 60 });
  });

  it("charts study minutes per track per week", () => {
    const weeks = studyMinutesByWeek(
      [
        block({ track_id: "a", status: "done" }),
        block({ track_id: "a", status: "partial", date: "2026-10-27" }),
        block({ track_id: "b", status: "done", date: "2026-11-02" }),
        block({ track_id: "a", status: "planned" }),
        block({ status: "done" }),
      ],
      TODAY,
      2
    );
    expect(weeks).toEqual([
      { weekStart: "2026-10-26", minutes: { a: 30 } },
      { weekStart: "2026-11-02", minutes: { a: 60, b: 60 } },
    ]);
  });
});

describe("dashboard layout", () => {
  it("defaults to goals open and the rest collapsed", () => {
    const layout = defaultLayout();
    expect(layout[0]).toEqual({ id: "goals", state: "open" });
    expect(layout.slice(1).every((setting) => setting.state === "collapsed")).toBe(true);
    expect(layout).toHaveLength(9);
  });

  it("keeps a saved order and adds anything new at the end", () => {
    const saved: WidgetSetting[] = [
      { id: "weekly", state: "open" },
      { id: "goals", state: "hidden" },
    ];
    const layout = normalizeLayout(saved);
    expect(layout.slice(0, 2)).toEqual(saved);
    expect(layout).toHaveLength(9);
  });

  it("drops unknown and repeated widgets", () => {
    const layout = normalizeLayout([
      { id: "gone" as never, state: "open" },
      { id: "goals", state: "open" },
      { id: "goals", state: "hidden" },
    ]);
    expect(layout.filter((setting) => setting.id === "goals")).toEqual([{ id: "goals", state: "open" }]);
    expect(layout.some((setting) => (setting.id as string) === "gone")).toBe(false);
  });

  it("moves a widget up and down, stopping at the ends", () => {
    const layout = defaultLayout();
    expect(moveWidget(layout, "today", -1)[0].id).toBe("today");
    expect(moveWidget(layout, "goals", -1)).toBe(layout);
    expect(moveWidget(layout, "weekly", 1)).toBe(layout);
  });
});

describe("service", () => {
  let repo: AppRepo;
  let ctx: ScheduleContext;

  beforeEach(() => {
    repo = createMemoryRepo();
    ctx = { repo, today: TODAY };
  });

  it("toggles a task done and back, changing the goal's progress", async () => {
    const created = await repo.createGoal({ title: "G", why: "", target_date: null, status: "active" });
    await repo.createProject({ goal_id: created.id, title: "P", status: "active", progress_mode: "tasks", manual_percent: 0 });
    const [own] = await repo.listProjects();
    await repo.createTask({ project_id: own.id, title: "T", due_date: null, status: "todo", estimate_minutes: null, category: "other", track_id: null });
    const [created_task] = await repo.listTasks();

    await command.toggleTaskDone(ctx, created_task.id);
    expect((await command.getGoalsView(ctx))[0].percent).toBe(100);

    await command.toggleTaskDone(ctx, created_task.id);
    expect((await command.getGoalsView(ctx))[0].percent).toBe(0);
  });

  it("reports a missing task and a missing goal", async () => {
    expect(await command.toggleTaskDone(ctx, crypto.randomUUID())).toEqual({ ok: false, code: "notFound" });
    expect(await command.getGoalDetail(ctx, crypto.randomUUID())).toBeNull();
  });

  it("deleting a goal removes its projects and tasks", async () => {
    const created = await repo.createGoal({ title: "G", why: "", target_date: null, status: "active" });
    await repo.createProject({ goal_id: created.id, title: "P", status: "active", progress_mode: "tasks", manual_percent: 0 });
    const [own] = await repo.listProjects();
    await repo.createTask({ project_id: own.id, title: "T", due_date: null, status: "todo", estimate_minutes: null, category: "other", track_id: null });

    await repo.deleteGoal(created.id);
    expect(await repo.listProjects()).toEqual([]);
    expect(await repo.listTasks()).toEqual([]);
  });

  it("gives new units the next position", async () => {
    const track = await repo.createTrack({ kind: "course", title: "C" });
    await command.addUnit(ctx, { track_id: track.id, title: "First", percent: 0 });
    await command.addUnit(ctx, { track_id: track.id, title: "Second", percent: 0 });
    const detail = await command.getTrackDetail(ctx, track.id);
    expect(detail?.units.map((unit) => [unit.title, unit.position])).toEqual([
      ["First", 0],
      ["Second", 1],
    ]);
  });

  it("deleting a track clears its tag from blocks without deleting them", async () => {
    const track = await repo.createTrack({ kind: "course", title: "C" });
    await schedule.ensureLoopReady(ctx, ["Semester"]);
    const [template] = await repo.listTemplates();
    await schedule.createBlock(ctx, {
      template_id: template.id,
      weekday: 2,
      start_time: "09:00",
      end_time: "10:00",
      category: "study",
      title: "Study",
      notes: "",
      track_id: track.id,
    });
    expect((await repo.listInstances(TODAY, TODAY))[0].track_id).toBe(track.id);

    await repo.deleteTrack(track.id);
    expect((await repo.listInstances(TODAY, TODAY))[0].track_id).toBeNull();
    expect((await repo.listBlocks())[0].track_id).toBeNull();
  });

  it("toggles a habit check-in, but not ahead of time", async () => {
    await repo.createHabit({ title: "Gym", target_per_week: 4, active: true });
    const [habit] = await repo.listHabits();

    await command.toggleCheckin(ctx, habit.id, TODAY);
    expect(await repo.listCheckins(TODAY, TODAY)).toHaveLength(1);

    await command.toggleCheckin(ctx, habit.id, TODAY);
    expect(await repo.listCheckins(TODAY, TODAY)).toHaveLength(0);

    expect(await command.toggleCheckin(ctx, habit.id, "2026-11-04")).toEqual({ ok: false, code: "checkinInFuture" });
  });

  it("keeps mobile and desktop layouts separate", async () => {
    await command.saveDashboardLayout(ctx, "mobile", [{ id: "weekly", state: "open" }]);
    const layouts = await command.getDashboardLayouts(ctx);
    expect(layouts.mobile[0].id).toBe("weekly");
    expect(layouts.desktop[0].id).toBe("goals");
  });

  it("repeats a day's snapshot without duplicating it", async () => {
    await repo.createGoal({ title: "G", why: "", target_date: null, status: "active" });
    await command.recordProgressSnapshots(ctx);
    await command.recordProgressSnapshots(ctx);
    const [own] = await repo.listGoals();
    expect(await repo.listSnapshots("goal", [own.id])).toHaveLength(1);
  });

  it("shows open tasks with due dates on the calendar, linking to their goal", async () => {
    const created = await repo.createGoal({ title: "G", why: "", target_date: null, status: "active" });
    await repo.createProject({ goal_id: created.id, title: "P", status: "active", progress_mode: "tasks", manual_percent: 0 });
    const [own] = await repo.listProjects();
    const fields = { project_id: own.id, estimate_minutes: null, category: "other" as const, track_id: null };
    await repo.createTask({ ...fields, title: "Due", due_date: TODAY, status: "todo" });
    await repo.createTask({ ...fields, title: "Finished", due_date: TODAY, status: "done" });
    await repo.createTask({ ...fields, title: "No date", due_date: null, status: "todo" });

    const feed = await schedule.getCalendarFeed(ctx, TODAY, TODAY);
    expect(feed.map((item) => item.title)).toEqual(["Due"]);
    expect(feed[0].kind).toBe("task");
    expect(feed[0].link).toBe(`/goals/${created.id}`);
    expect(feed[0].all_day).toBe(true);
  });

  it("lists what's coming up in the next week", async () => {
    await schedule.createEvent(ctx, {
      title: "Dentist",
      notes: "",
      category: "other",
      all_day: false,
      start_date: "2026-11-05",
      end_date: "2026-11-05",
      start_time: "14:00",
      end_time: "15:00",
    });
    await schedule.createEvent(ctx, {
      title: "Too far",
      notes: "",
      category: "other",
      all_day: false,
      start_date: "2026-11-20",
      end_date: "2026-11-20",
      start_time: "14:00",
      end_time: "15:00",
    });
    const upcoming = await command.getUpcoming(ctx);
    expect(upcoming.events.map((event) => event.title)).toEqual(["Dentist"]);
  });
});
