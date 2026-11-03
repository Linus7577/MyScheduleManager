import { z } from "zod";
import { CATEGORY_KEYS } from "@/config/game.config";
import { MAX_TOOL_RESULT_CHARS, PROPOSAL_EXPIRY_HOURS, UNDO_WINDOW_DAYS } from "@/config/oracle.config";
import { goalPercent, projectPercent, trackPercent } from "@/features/command/logic";
import { getGameView } from "@/features/game/service";
import type { ScheduleContext } from "@/features/schedule/generation";
import { activeTemplateId, weekDates, weekStart } from "@/features/schedule/logic";
import { dateSchema, timeSchema } from "@/features/schedule/schema";
import type { ToolCall, ToolDefinition } from "./provider";
import type { BlockChange, TemplateChange, UndoPlan } from "./types";

const MS_PER_HOUR = 3_600_000;

const empty = z.strictObject({});
const id = z.uuid();
const title = z.string().trim().min(1).max(120);

const blockChangesArgs = z.strictObject({
  summary: z.string().trim().min(1).max(300),
  changes: z
    .array(
      z.strictObject({
        instance_id: id,
        start_time: timeSchema.optional(),
        end_time: timeSchema.optional(),
        title: title.optional(),
        remove: z.boolean().optional(),
      })
    )
    .min(1)
    .max(20),
});

const templateChangesArgs = z.strictObject({
  summary: z.string().trim().min(1).max(300),
  changes: z
    .array(
      z.strictObject({
        op: z.enum(["add", "update", "remove"]),
        block_id: id.optional(),
        weekday: z.number().int().min(1).max(7).optional(),
        start_time: timeSchema.optional(),
        end_time: timeSchema.optional(),
        category: z.enum(CATEGORY_KEYS).optional(),
        title: title.optional(),
        notes: z.string().trim().max(2000).optional(),
      })
    )
    .min(1)
    .max(20),
});

const createGoalArgs = z.strictObject({
  title,
  why: z.string().trim().max(2000).optional(),
  target_date: dateSchema.optional(),
});
const createProjectArgs = z.strictObject({ goal_id: id, title });
const createTaskArgs = z.strictObject({
  project_id: id,
  title,
  due_date: dateSchema.optional(),
  estimate_minutes: z.number().int().min(1).max(100000).optional(),
  category: z.enum(CATEGORY_KEYS).optional(),
});
const updateProgressArgs = z
  .strictObject({ project_id: id.optional(), unit_id: id.optional(), percent: z.number().int().min(0).max(100) })
  .refine((args) => Boolean(args.project_id) !== Boolean(args.unit_id));
const weeklyReviewArgs = z.strictObject({ text: z.string().trim().min(1).max(4000) });

const noParams = { type: "object", properties: {}, additionalProperties: false };

function tool(name: string, description: string, parameters: Record<string, unknown> = noParams): ToolDefinition {
  return { type: "function", function: { name, description, parameters } };
}

const blockSpecProps = {
  weekday: { type: "integer", description: "1 is Monday, 7 is Sunday" },
  start_time: { type: "string", description: "HH:MM" },
  end_time: { type: "string", description: "HH:MM" },
  category: { type: "string", enum: CATEGORY_KEYS },
  title: { type: "string" },
  notes: { type: "string" },
};

/** The complete list of what the model can ever do. Anything not here, it simply cannot attempt. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  tool("get_schedule", "This week's blocks, with ids and status."),
  tool("get_goals", "Active goals, projects and open tasks, with ids and progress."),
  tool("get_game_state", "XP, level, tier, Power and streak."),
  tool("get_learning", "Learning tracks and units, with ids and progress."),
  tool("get_habits", "Habits and this week's check-ins."),
  tool("recommend_next_action", "The most useful next step right now, from the schedule and deadlines."),
  tool("propose_block_changes", "Propose changing or removing this week's planned blocks. Needs the owner's approval.", {
    type: "object",
    required: ["summary", "changes"],
    properties: {
      summary: { type: "string" },
      changes: {
        type: "array",
        items: {
          type: "object",
          required: ["instance_id"],
          properties: {
            instance_id: { type: "string" },
            start_time: { type: "string", description: "HH:MM" },
            end_time: { type: "string", description: "HH:MM" },
            title: { type: "string" },
            remove: { type: "boolean" },
          },
        },
      },
    },
  }),
  tool("propose_template_changes", "Propose permanent changes to the active weekly template. Needs the owner's approval.", {
    type: "object",
    required: ["summary", "changes"],
    properties: {
      summary: { type: "string" },
      changes: {
        type: "array",
        items: {
          type: "object",
          required: ["op"],
          properties: { op: { type: "string", enum: ["add", "update", "remove"] }, block_id: { type: "string" }, ...blockSpecProps },
        },
      },
    },
  }),
  tool("create_goal", "Create a goal.", {
    type: "object",
    required: ["title"],
    properties: { title: { type: "string" }, why: { type: "string" }, target_date: { type: "string", description: "YYYY-MM-DD" } },
  }),
  tool("create_project", "Create a project in a goal.", {
    type: "object",
    required: ["goal_id", "title"],
    properties: { goal_id: { type: "string" }, title: { type: "string" } },
  }),
  tool("create_task", "Create a task in a project.", {
    type: "object",
    required: ["project_id", "title"],
    properties: {
      project_id: { type: "string" },
      title: { type: "string" },
      due_date: { type: "string", description: "YYYY-MM-DD" },
      estimate_minutes: { type: "integer" },
      category: { type: "string", enum: CATEGORY_KEYS },
    },
  }),
  tool("update_progress", "Set percent complete on a project or a learning unit. Give project_id or unit_id, not both.", {
    type: "object",
    required: ["percent"],
    properties: { project_id: { type: "string" }, unit_id: { type: "string" }, percent: { type: "integer" } },
  }),
  tool("write_weekly_review", "Save this week's written review.", {
    type: "object",
    required: ["text"],
    properties: { text: { type: "string" } },
  }),
];

export type ToolOutcome = { result: string; createdCard: boolean };

const outcome = (value: unknown, createdCard = false): ToolOutcome => ({
  result: JSON.stringify(value).slice(0, MAX_TOOL_RESULT_CHARS),
  createdCard,
});
const toolError = (message: string): ToolOutcome => outcome({ error: message });

const nowOf = (ctx: ScheduleContext) => ctx.now ?? new Date();

async function recordAction(
  ctx: ScheduleContext,
  conversationId: string,
  tool: string,
  summary: string,
  undo: UndoPlan
): Promise<void> {
  const now = nowOf(ctx);
  await ctx.repo.createAction({
    conversation_id: conversationId,
    tool,
    summary,
    undo,
    undo_until: new Date(now.getTime() + UNDO_WINDOW_DAYS * 24 * MS_PER_HOUR).toISOString(),
  });
  await ctx.repo.addAudit({ actor: "oracle", action: "ai_action", entity: tool, details: { summary } });
}

function proposalExpiry(ctx: ScheduleContext): string {
  return new Date(nowOf(ctx).getTime() + PROPOSAL_EXPIRY_HOURS * MS_PER_HOUR).toISOString();
}

/* Reads */

async function readSchedule(ctx: ScheduleContext) {
  const dates = weekDates(ctx.today);
  const instances = await ctx.repo.listInstances(dates[0], dates[6]);
  return instances
    .filter((block) => !block.is_cancelled)
    .map((block) => ({
      id: block.id,
      date: block.date,
      start: block.start_time,
      end: block.end_time,
      title: block.title,
      category: block.category,
      status: block.status,
    }));
}

async function readGoals(ctx: ScheduleContext) {
  const [goals, projects, tasks] = await Promise.all([ctx.repo.listGoals(), ctx.repo.listProjects(), ctx.repo.listTasks()]);
  return goals
    .filter((goal) => goal.status === "active")
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      percent: goalPercent(goal, projects, tasks),
      projects: projects
        .filter((project) => project.goal_id === goal.id)
        .map((project) => ({
          id: project.id,
          title: project.title,
          percent: projectPercent(project, tasks),
          open_tasks: tasks
            .filter((task) => task.project_id === project.id && task.status !== "done")
            .map((task) => ({ id: task.id, title: task.title, due: task.due_date })),
        })),
    }));
}

async function readLearning(ctx: ScheduleContext) {
  const [tracks, units] = await Promise.all([ctx.repo.listTracks(), ctx.repo.listUnits()]);
  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    kind: track.kind,
    percent: trackPercent(track.id, units),
    units: units
      .filter((unit) => unit.track_id === track.id)
      .map((unit) => ({ id: unit.id, title: unit.title, percent: unit.percent })),
  }));
}

async function readHabits(ctx: ScheduleContext) {
  const [habits, checkins] = await Promise.all([
    ctx.repo.listHabits(),
    ctx.repo.listCheckins(weekStart(ctx.today), ctx.today),
  ]);
  return habits
    .filter((habit) => habit.active)
    .map((habit) => ({
      title: habit.title,
      target_per_week: habit.target_per_week,
      this_week: checkins.filter((checkin) => checkin.habit_id === habit.id).length,
    }));
}

/** Works from facts, not the model: the block on now, then the next open block, then the nearest deadline. */
export async function recommendNextAction(ctx: ScheduleContext, time: string) {
  const [instances, tasks] = await Promise.all([ctx.repo.listInstances(ctx.today, ctx.today), ctx.repo.listTasks()]);
  const open = instances.filter((block) => block.status === "planned" && !block.is_cancelled);

  const current = open.find((block) => block.start_time <= time && time < block.end_time);
  if (current) return { kind: "block_now", title: current.title, until: current.end_time };

  const next = open.filter((block) => block.start_time > time).sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  if (next) return { kind: "next_block", title: next.title, at: next.start_time };

  const task = tasks
    .filter((candidate) => candidate.status !== "done" && candidate.due_date)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))[0];
  if (task) return { kind: "nearest_deadline", title: task.title, due: task.due_date };

  return { kind: "nothing_pressing" };
}

/* Proposals */

async function proposeBlockChanges(ctx: ScheduleContext, conversationId: string, input: unknown): Promise<ToolOutcome> {
  const args = blockChangesArgs.parse(input);
  const dates = weekDates(ctx.today);
  const changes: BlockChange[] = [];

  for (const change of args.changes) {
    const block = await ctx.repo.getInstance(change.instance_id);
    if (!block || block.is_cancelled) return toolError(`No block with id ${change.instance_id}.`);
    if (block.date < dates[0] || block.date > dates[6]) return toolError(`${block.title} isn't in this week.`);
    if (block.date < ctx.today || (await ctx.repo.getClosedDay(block.date))) return toolError(`${block.title} is in the past.`);
    if (block.status !== "planned") return toolError(`${block.title} has already been logged or is resting, so it can't change.`);
    if (block.event_id) return toolError(`${block.title} is a calendar event, so it can't be changed here.`);

    const before = { start_time: block.start_time, end_time: block.end_time, title: block.title };
    if (change.remove) {
      changes.push({ instance_id: block.id, date: block.date, before, after: null });
      continue;
    }
    const after = {
      start_time: change.start_time ?? block.start_time,
      end_time: change.end_time ?? block.end_time,
      title: change.title ?? block.title,
    };
    if (after.start_time === after.end_time) return toolError("A block's start and end can't be the same.");
    changes.push({ instance_id: block.id, date: block.date, before, after });
  }

  const proposal = await ctx.repo.createProposal({
    conversation_id: conversationId,
    kind: "block_changes",
    summary: args.summary,
    changes,
    expires_at: proposalExpiry(ctx),
  });
  await ctx.repo.addAudit({ actor: "oracle", action: "proposal_created", entity: proposal.id, details: { kind: proposal.kind } });
  return outcome({ proposed: true, status: "waiting_for_owner_approval", nothing_changed_yet: true }, true);
}

async function proposeTemplateChanges(ctx: ScheduleContext, conversationId: string, input: unknown): Promise<ToolOutcome> {
  const args = templateChangesArgs.parse(input);
  const templateId = activeTemplateId(ctx.today, await ctx.repo.listActivations());
  if (!templateId) return toolError("There's no active template.");

  const changes: TemplateChange[] = [];
  for (const change of args.changes) {
    if (change.op === "add") {
      const { weekday, start_time, end_time, category, title: name, notes } = change;
      if (!weekday || !start_time || !end_time || !name) return toolError("Adding a block needs weekday, start_time, end_time and title.");
      if (start_time === end_time) return toolError("A block's start and end can't be the same.");
      changes.push({
        op: "add",
        template_id: templateId,
        block_id: null,
        before: null,
        after: { weekday, start_time, end_time, category: category ?? "other", title: name, notes: notes ?? "" },
      });
      continue;
    }

    const block = change.block_id ? await ctx.repo.getBlock(change.block_id) : null;
    if (!block) return toolError("That change needs the block_id of an existing template block.");
    if (block.template_id !== templateId) return toolError("That block isn't in the active template.");
    const before = {
      weekday: block.weekday,
      start_time: block.start_time,
      end_time: block.end_time,
      category: block.category,
      title: block.title,
      notes: block.notes,
    };
    if (change.op === "remove") {
      changes.push({ op: "remove", template_id: templateId, block_id: block.id, before, after: null });
      continue;
    }
    const after = {
      weekday: change.weekday ?? block.weekday,
      start_time: change.start_time ?? block.start_time,
      end_time: change.end_time ?? block.end_time,
      category: change.category ?? block.category,
      title: change.title ?? block.title,
      notes: change.notes ?? block.notes,
    };
    if (after.start_time === after.end_time) return toolError("A block's start and end can't be the same.");
    changes.push({ op: "update", template_id: templateId, block_id: block.id, before, after });
  }

  const proposal = await ctx.repo.createProposal({
    conversation_id: conversationId,
    kind: "template_changes",
    summary: args.summary,
    changes,
    expires_at: proposalExpiry(ctx),
  });
  await ctx.repo.addAudit({ actor: "oracle", action: "proposal_created", entity: proposal.id, details: { kind: proposal.kind } });
  return outcome({ proposed: true, status: "waiting_for_owner_approval", nothing_changed_yet: true }, true);
}

/* Automatic actions, each recorded with a way to undo it */

async function createGoalTool(ctx: ScheduleContext, conversationId: string, input: unknown): Promise<ToolOutcome> {
  const args = createGoalArgs.parse(input);
  const goal = await ctx.repo.createGoal({
    title: args.title,
    why: args.why ?? "",
    target_date: args.target_date ?? null,
    status: "active",
  });
  await recordAction(ctx, conversationId, "create_goal", args.title, { kind: "delete_goal", id: goal.id });
  return outcome({ created: true, goal_id: goal.id }, true);
}

async function createProjectTool(ctx: ScheduleContext, conversationId: string, input: unknown): Promise<ToolOutcome> {
  const args = createProjectArgs.parse(input);
  if (!(await ctx.repo.listGoals()).some((goal) => goal.id === args.goal_id)) return toolError("No goal with that id.");
  const project = await ctx.repo.createProject({
    goal_id: args.goal_id,
    title: args.title,
    status: "active",
    progress_mode: "tasks",
    manual_percent: 0,
  });
  await recordAction(ctx, conversationId, "create_project", args.title, { kind: "delete_project", id: project.id });
  return outcome({ created: true, project_id: project.id }, true);
}

async function createTaskTool(ctx: ScheduleContext, conversationId: string, input: unknown): Promise<ToolOutcome> {
  const args = createTaskArgs.parse(input);
  if (!(await ctx.repo.listProjects()).some((project) => project.id === args.project_id)) return toolError("No project with that id.");
  const task = await ctx.repo.createTask({
    project_id: args.project_id,
    title: args.title,
    due_date: args.due_date ?? null,
    status: "todo",
    estimate_minutes: args.estimate_minutes ?? null,
    category: args.category ?? "other",
    track_id: null,
  });
  await recordAction(ctx, conversationId, "create_task", args.title, { kind: "delete_task", id: task.id });
  return outcome({ created: true, task_id: task.id }, true);
}

async function updateProgressTool(ctx: ScheduleContext, conversationId: string, input: unknown): Promise<ToolOutcome> {
  const args = updateProgressArgs.parse(input);

  if (args.project_id) {
    const project = (await ctx.repo.listProjects()).find((candidate) => candidate.id === args.project_id);
    if (!project) return toolError("No project with that id.");
    await ctx.repo.updateProject(project.id, {
      goal_id: project.goal_id,
      title: project.title,
      status: project.status,
      progress_mode: "manual",
      manual_percent: args.percent,
    });
    await recordAction(ctx, conversationId, "update_progress", `${project.title}: ${args.percent}%`, {
      kind: "restore_project",
      id: project.id,
      progress_mode: project.progress_mode,
      manual_percent: project.manual_percent,
    });
    return outcome({ updated: true }, true);
  }

  const unit = (await ctx.repo.listUnits()).find((candidate) => candidate.id === args.unit_id);
  if (!unit) return toolError("No learning unit with that id.");
  await ctx.repo.updateUnit(unit.id, { track_id: unit.track_id, title: unit.title, position: unit.position, percent: args.percent });
  await recordAction(ctx, conversationId, "update_progress", `${unit.title}: ${args.percent}%`, {
    kind: "restore_unit",
    id: unit.id,
    percent: unit.percent,
  });
  return outcome({ updated: true }, true);
}

async function writeReviewTool(ctx: ScheduleContext, conversationId: string, input: unknown): Promise<ToolOutcome> {
  const args = weeklyReviewArgs.parse(input);
  const week = weekStart(ctx.today);
  const previous = await ctx.repo.getWeeklyReview(week);
  await ctx.repo.saveWeeklyReview(week, args.text);
  await recordAction(ctx, conversationId, "write_weekly_review", week, { kind: "restore_review", week_start: week, text: previous });
  return outcome({ saved: true }, true);
}

/**
 * Runs one tool call from the model. Its name and arguments are untrusted input, so each is checked against the list
 * above and its schema here on the server. A bad call becomes an error the model can read, never a crash.
 */
export async function executeTool(
  ctx: ScheduleContext,
  conversationId: string,
  call: ToolCall,
  currentTime: string
): Promise<ToolOutcome> {
  let input: unknown;
  try {
    input = call.function.arguments.trim() ? JSON.parse(call.function.arguments) : {};
  } catch {
    return toolError("The arguments weren't valid JSON.");
  }

  try {
    switch (call.function.name) {
      case "get_schedule":
        empty.parse(input);
        return outcome(await readSchedule(ctx));
      case "get_goals":
        empty.parse(input);
        return outcome(await readGoals(ctx));
      case "get_game_state":
        empty.parse(input);
        return outcome(await getGameView(ctx));
      case "get_learning":
        empty.parse(input);
        return outcome(await readLearning(ctx));
      case "get_habits":
        empty.parse(input);
        return outcome(await readHabits(ctx));
      case "recommend_next_action":
        empty.parse(input);
        return outcome(await recommendNextAction(ctx, currentTime));
      case "propose_block_changes":
        return await proposeBlockChanges(ctx, conversationId, input);
      case "propose_template_changes":
        return await proposeTemplateChanges(ctx, conversationId, input);
      case "create_goal":
        return await createGoalTool(ctx, conversationId, input);
      case "create_project":
        return await createProjectTool(ctx, conversationId, input);
      case "create_task":
        return await createTaskTool(ctx, conversationId, input);
      case "update_progress":
        return await updateProgressTool(ctx, conversationId, input);
      case "write_weekly_review":
        return await writeReviewTool(ctx, conversationId, input);
      default:
        return toolError(`There's no tool called ${call.function.name}.`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) return toolError("Those arguments aren't valid for this tool.");
    throw error;
  }
}
