import type {
  DashboardDevice,
  Goal,
  GoalFields,
  Habit,
  HabitCheckin,
  HabitFields,
  LearningTrack,
  LearningUnit,
  ProgressSnapshot,
  Project,
  ProjectFields,
  SnapshotEntity,
  Task,
  TaskFields,
  TrackFields,
  UnitFields,
  WidgetSetting,
} from "./types";

export interface CommandRepo {
  listGoals(): Promise<Goal[]>;
  createGoal(fields: GoalFields): Promise<Goal>;
  updateGoal(id: string, fields: GoalFields): Promise<void>;
  deleteGoal(id: string): Promise<void>;

  listProjects(): Promise<Project[]>;
  createProject(fields: ProjectFields): Promise<Project>;
  updateProject(id: string, fields: ProjectFields): Promise<void>;
  deleteProject(id: string): Promise<void>;

  listTasks(): Promise<Task[]>;
  listTasksDue(from: string, to: string): Promise<Task[]>;
  createTask(fields: TaskFields): Promise<Task>;
  updateTask(id: string, fields: TaskFields): Promise<void>;
  deleteTask(id: string): Promise<void>;

  listTracks(): Promise<LearningTrack[]>;
  createTrack(fields: TrackFields): Promise<LearningTrack>;
  updateTrack(id: string, fields: TrackFields): Promise<void>;
  deleteTrack(id: string): Promise<void>;

  listUnits(): Promise<LearningUnit[]>;
  createUnit(fields: UnitFields): Promise<void>;
  updateUnit(id: string, fields: UnitFields): Promise<void>;
  deleteUnit(id: string): Promise<void>;

  /** A day's snapshot for an entity is replaced, so a chart shows that day's latest value. */
  upsertSnapshots(snapshots: ProgressSnapshot[]): Promise<void>;
  listSnapshots(entityType: SnapshotEntity, entityIds: string[]): Promise<ProgressSnapshot[]>;

  listHabits(): Promise<Habit[]>;
  createHabit(fields: HabitFields): Promise<void>;
  updateHabit(id: string, fields: HabitFields): Promise<void>;
  deleteHabit(id: string): Promise<void>;

  listCheckins(from: string, to: string): Promise<HabitCheckin[]>;
  addCheckin(habitId: string, date: string): Promise<void>;
  removeCheckin(habitId: string, date: string): Promise<void>;

  getWidgetLayout(device: DashboardDevice): Promise<WidgetSetting[] | null>;
  saveWidgetLayout(device: DashboardDevice, layout: WidgetSetting[]): Promise<void>;
}
