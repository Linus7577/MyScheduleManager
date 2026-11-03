import type { Category } from "@/config/game.config";

export type GoalStatus = "active" | "paused" | "done" | "dropped";
export type GoalFields = { title: string; why: string; target_date: string | null; status: GoalStatus };
export type Goal = GoalFields & { id: string; created_at: string };

export type ProjectStatus = "active" | "paused" | "done";
export type ProgressMode = "tasks" | "manual";
export type ProjectFields = {
  goal_id: string;
  title: string;
  status: ProjectStatus;
  progress_mode: ProgressMode;
  manual_percent: number;
};
export type Project = ProjectFields & { id: string };

export type TaskStatus = "todo" | "doing" | "done";
export type TaskFields = {
  project_id: string;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  estimate_minutes: number | null;
  category: Category;
  track_id: string | null;
};
export type Task = TaskFields & { id: string };

export type TrackKind = "course" | "roadmap" | "book";
export type TrackFields = { kind: TrackKind; title: string };
export type LearningTrack = TrackFields & { id: string; created_at: string };

export type UnitFields = { track_id: string; title: string; position: number; percent: number };
export type LearningUnit = UnitFields & { id: string };

export type SnapshotEntity = "goal" | "project" | "track";
export type ProgressSnapshot = { date: string; entity_type: SnapshotEntity; entity_id: string; percent: number };

export type HabitFields = { title: string; target_per_week: number; active: boolean };
export type Habit = HabitFields & { id: string; created_at: string };
export type HabitCheckin = { habit_id: string; date: string };

export const WIDGET_IDS = [
  "goals",
  "today",
  "learning",
  "habits",
  "spending",
  "portfolio",
  "oracle",
  "events",
  "weekly",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];
export type WidgetState = "open" | "collapsed" | "hidden";
export type WidgetSetting = { id: WidgetId; state: WidgetState };
export type DashboardDevice = "mobile" | "desktop";
