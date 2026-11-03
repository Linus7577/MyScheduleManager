"use server";

import { runAction } from "@/features/schedule/run-action";
import type { ActionResult } from "@/features/schedule/types";
import {
  createGoalSchema,
  createHabitSchema,
  createProjectSchema,
  createTaskSchema,
  createTrackSchema,
  createUnitSchema,
  idOnlySchema,
  saveLayoutSchema,
  toggleCheckinSchema,
  updateGoalSchema,
  updateHabitSchema,
  updateProjectSchema,
  updateTaskSchema,
  updateTrackSchema,
  updateUnitSchema,
} from "./schema";
import * as service from "./service";

const OK: ActionResult = { ok: true };

export async function createGoalAction(input: unknown) {
  return runAction(createGoalSchema, input, async (ctx, data) => {
    await ctx.repo.createGoal(data);
    return OK;
  });
}

export async function updateGoalAction(input: unknown) {
  return runAction(updateGoalSchema, input, async (ctx, { id, ...fields }) => {
    await ctx.repo.updateGoal(id, fields);
    return OK;
  });
}

export async function deleteGoalAction(input: unknown) {
  return runAction(idOnlySchema, input, async (ctx, data) => {
    await ctx.repo.deleteGoal(data.id);
    return OK;
  });
}

export async function createProjectAction(input: unknown) {
  return runAction(createProjectSchema, input, async (ctx, data) => {
    await ctx.repo.createProject(data);
    return OK;
  });
}

export async function updateProjectAction(input: unknown) {
  return runAction(updateProjectSchema, input, async (ctx, { id, ...fields }) => {
    await ctx.repo.updateProject(id, fields);
    return OK;
  });
}

export async function deleteProjectAction(input: unknown) {
  return runAction(idOnlySchema, input, async (ctx, data) => {
    await ctx.repo.deleteProject(data.id);
    return OK;
  });
}

export async function createTaskAction(input: unknown) {
  return runAction(createTaskSchema, input, async (ctx, data) => {
    await ctx.repo.createTask(data);
    return OK;
  });
}

export async function updateTaskAction(input: unknown) {
  return runAction(updateTaskSchema, input, async (ctx, { id, ...fields }) => {
    await ctx.repo.updateTask(id, fields);
    return OK;
  });
}

export async function deleteTaskAction(input: unknown) {
  return runAction(idOnlySchema, input, async (ctx, data) => {
    await ctx.repo.deleteTask(data.id);
    return OK;
  });
}

export async function toggleTaskDoneAction(input: unknown) {
  return runAction(idOnlySchema, input, (ctx, data) => service.toggleTaskDone(ctx, data.id));
}

export async function createTrackAction(input: unknown) {
  return runAction(createTrackSchema, input, async (ctx, data) => {
    await ctx.repo.createTrack(data);
    return OK;
  });
}

export async function updateTrackAction(input: unknown) {
  return runAction(updateTrackSchema, input, async (ctx, { id, ...fields }) => {
    await ctx.repo.updateTrack(id, fields);
    return OK;
  });
}

export async function deleteTrackAction(input: unknown) {
  return runAction(idOnlySchema, input, async (ctx, data) => {
    await ctx.repo.deleteTrack(data.id);
    return OK;
  });
}

export async function createUnitAction(input: unknown) {
  return runAction(createUnitSchema, input, (ctx, fields) => service.addUnit(ctx, fields));
}

export async function updateUnitAction(input: unknown) {
  return runAction(updateUnitSchema, input, async (ctx, { id, ...fields }) => {
    await ctx.repo.updateUnit(id, fields);
    return OK;
  });
}

export async function deleteUnitAction(input: unknown) {
  return runAction(idOnlySchema, input, async (ctx, data) => {
    await ctx.repo.deleteUnit(data.id);
    return OK;
  });
}

export async function createHabitAction(input: unknown) {
  return runAction(createHabitSchema, input, async (ctx, data) => {
    await ctx.repo.createHabit(data);
    return OK;
  });
}

export async function updateHabitAction(input: unknown) {
  return runAction(updateHabitSchema, input, async (ctx, { id, ...fields }) => {
    await ctx.repo.updateHabit(id, fields);
    return OK;
  });
}

export async function deleteHabitAction(input: unknown) {
  return runAction(idOnlySchema, input, async (ctx, data) => {
    await ctx.repo.deleteHabit(data.id);
    return OK;
  });
}

export async function toggleCheckinAction(input: unknown) {
  return runAction(toggleCheckinSchema, input, (ctx, data) => service.toggleCheckin(ctx, data.habit_id, data.date));
}

export async function saveLayoutAction(input: unknown) {
  return runAction(saveLayoutSchema, input, (ctx, data) => service.saveDashboardLayout(ctx, data.device, data.layout));
}
