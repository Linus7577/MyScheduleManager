import { z } from "zod";
import { CATEGORY_KEYS } from "@/config/game.config";
import { dateSchema } from "@/features/schedule/schema";
import { WIDGET_IDS } from "./types";

const id = z.uuid();
const title = z.string().trim().min(1).max(120);
const percent = z.number().int().min(0).max(100);

export const idOnlySchema = z.strictObject({ id });

const goalFields = {
  title,
  why: z.string().trim().max(2000),
  target_date: dateSchema.nullable(),
  status: z.enum(["active", "paused", "done", "dropped"]),
};
export const createGoalSchema = z.strictObject(goalFields);
export const updateGoalSchema = z.strictObject({ id, ...goalFields });

const projectFields = {
  goal_id: id,
  title,
  status: z.enum(["active", "paused", "done"]),
  progress_mode: z.enum(["tasks", "manual"]),
  manual_percent: percent,
};
export const createProjectSchema = z.strictObject(projectFields);
export const updateProjectSchema = z.strictObject({ id, ...projectFields });

const taskFields = {
  project_id: id,
  title,
  due_date: dateSchema.nullable(),
  status: z.enum(["todo", "doing", "done"]),
  estimate_minutes: z.number().int().min(1).max(100000).nullable(),
  category: z.enum(CATEGORY_KEYS),
  track_id: id.nullable(),
};
export const createTaskSchema = z.strictObject(taskFields);
export const updateTaskSchema = z.strictObject({ id, ...taskFields });

const trackFields = { kind: z.enum(["course", "roadmap", "book"]), title };
export const createTrackSchema = z.strictObject(trackFields);
export const updateTrackSchema = z.strictObject({ id, ...trackFields });

const unitFields = { track_id: id, title, percent };
export const createUnitSchema = z.strictObject(unitFields);
export const updateUnitSchema = z.strictObject({ id, position: z.number().int().min(0).max(100000), ...unitFields });

const habitFields = { title, target_per_week: z.number().int().min(1).max(7), active: z.boolean() };
export const createHabitSchema = z.strictObject(habitFields);
export const updateHabitSchema = z.strictObject({ id, ...habitFields });

export const toggleCheckinSchema = z.strictObject({ habit_id: id, date: dateSchema });

export const saveLayoutSchema = z.strictObject({
  device: z.enum(["mobile", "desktop"]),
  layout: z
    .array(z.strictObject({ id: z.enum(WIDGET_IDS), state: z.enum(["open", "collapsed", "hidden"]) }))
    .max(WIDGET_IDS.length),
});
