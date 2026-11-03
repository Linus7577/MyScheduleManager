import {
  AI_RATE_LIMIT_PER_MINUTE,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_HISTORY_MESSAGES,
  MAX_TOOL_ROUNDS,
  SUGGESTIONS_PER_DAY,
} from "@/config/oracle.config";
import type { ScheduleContext } from "@/features/schedule/generation";
import { createBlock, deleteBlock, cancelInstance, editInstance, updateBlock } from "@/features/schedule/service";
import type { ActionResult, ScheduleErrorCode } from "@/features/schedule/types";
import { buildContextSummary, SYSTEM_PROMPT } from "./context";
import { ProviderError, type AiProvider, type ChatMessage } from "./provider";
import { executeTool, TOOL_DEFINITIONS } from "./tools";
import type { BlockChange, BlockSnapshot, OracleAction, Proposal, TemplateBlockSpec, TemplateChange } from "./types";

const OK: ActionResult = { ok: true };
const fail = (code: ScheduleErrorCode): ActionResult => ({ ok: false, code });

const nowOf = (ctx: ScheduleContext) => ctx.now ?? new Date();

const currentTime = (ctx: ScheduleContext) => (ctx.wallClock ? ctx.wallClock.slice(11, 16) : "00:00");

export type OracleEvent =
  | { type: "text"; text: string }
  | { type: "card" }
  | { type: "done" }
  | { type: "error"; code: "oracleBusy" | "oracleUnavailable" | "rateLimited" | "failed" };

async function conversationId(ctx: ScheduleContext): Promise<string> {
  return (await ctx.repo.getLatestConversationId()) ?? (await ctx.repo.createConversation());
}

/** The model only ever sees the system rules, a short summary, and the last few messages. */
async function buildMessages(ctx: ScheduleContext, id: string): Promise<ChatMessage[]> {
  const [summary, history] = await Promise.all([buildContextSummary(ctx), ctx.repo.listMessages(id, MAX_HISTORY_MESSAGES)]);
  return [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${summary}` },
    ...history.map((message) => ({ role: message.role, content: message.content.slice(0, MAX_HISTORY_MESSAGE_CHARS) })),
  ];
}

/**
 * One exchange: the owner's message, then rounds of the model asking for tools until it answers.
 * Text streams out as it arrives. Every tool call goes through the server's own checks in tools.ts.
 */
export async function runOracleTurn(input: {
  ctx: ScheduleContext;
  provider: AiProvider | null;
  text: string;
  emit: (event: OracleEvent) => void;
}): Promise<void> {
  const { ctx, provider, text, emit } = input;

  if (!provider) return emit({ type: "error", code: "oracleUnavailable" });
  if (!(await ctx.repo.bumpRateLimit(AI_RATE_LIMIT_PER_MINUTE, nowOf(ctx)))) {
    return emit({ type: "error", code: "rateLimited" });
  }

  const id = await conversationId(ctx);
  await ctx.repo.addMessage(id, "user", text);

  try {
    const messages = await buildMessages(ctx, id);
    let reply = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await provider.complete({
        messages,
        tools: TOOL_DEFINITIONS,
        onText: (delta) => emit({ type: "text", text: delta }),
      });
      reply += result.text;

      if (result.toolCalls.length === 0) {
        if (reply.trim()) await ctx.repo.addMessage(id, "assistant", reply);
        return emit({ type: "done" });
      }

      messages.push({ role: "assistant", content: result.text, tool_calls: result.toolCalls });
      for (const call of result.toolCalls) {
        const outcome = await executeTool(ctx, id, call, currentTime(ctx));
        messages.push({ role: "tool", tool_call_id: call.id, content: outcome.result });
        if (outcome.createdCard) emit({ type: "card" });
      }
    }

    // It kept asking for tools. Whatever it wrote stands, and its actions are already recorded with their cards.
    if (reply.trim()) await ctx.repo.addMessage(id, "assistant", reply);
    emit({ type: "done" });
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error(error);
    emit({ type: "error", code: error instanceof ProviderError ? error.code : "failed" });
  }
}

/* Reading */

/** A proposal past its 48 hours reads as expired, even before anything has marked it so. */
export function effectiveStatus(proposal: Proposal, now: Date): Proposal["status"] {
  if (proposal.status === "pending" && new Date(proposal.expires_at).getTime() < now.getTime()) return "expired";
  return proposal.status;
}

export async function getChatView(ctx: ScheduleContext) {
  const id = await ctx.repo.getLatestConversationId();
  if (!id) return { messages: [], proposals: [], actions: [] };

  const [messages, proposals, actions] = await Promise.all([
    ctx.repo.listMessages(id, 60),
    ctx.repo.listProposals(id),
    ctx.repo.listActions(id),
  ]);
  const now = nowOf(ctx);
  return {
    messages,
    proposals: proposals.map((proposal) => ({ ...proposal, status: effectiveStatus(proposal, now) })),
    actions,
  };
}

/* Proposals */

function blockChangeValid(change: BlockChange): boolean {
  return change.after === null || change.after.start_time !== change.after.end_time;
}

async function applyBlockChanges(ctx: ScheduleContext, changes: BlockChange[]): Promise<ActionResult> {
  // Everything is checked first, so a problem with one change can't leave the others half applied.
  for (const change of changes) {
    const block = await ctx.repo.getInstance(change.instance_id);
    if (!block || block.is_cancelled || block.status !== "planned") return fail("proposalOutdated");
    if (await ctx.repo.getClosedDay(block.date)) return fail("proposalOutdated");
    if (!blockChangeValid(change)) return fail("invalid");
  }

  for (const change of changes) {
    const block = await ctx.repo.getInstance(change.instance_id);
    if (!block) return fail("proposalOutdated");
    const result =
      change.after === null
        ? await cancelInstance(ctx, block.id)
        : await editInstance(
            ctx,
            block.id,
            {
              start_time: change.after.start_time,
              end_time: change.after.end_time,
              title: change.after.title,
              category: block.category,
              notes: block.notes,
              track_id: block.track_id ?? null,
            },
            false
          );
    if (!result.ok) return result;
  }
  return OK;
}

async function applyTemplateChanges(ctx: ScheduleContext, changes: TemplateChange[]): Promise<ActionResult> {
  for (const change of changes) {
    if (change.op !== "add" && !(change.block_id && (await ctx.repo.getBlock(change.block_id)))) return fail("proposalOutdated");
    if (change.after && change.after.start_time === change.after.end_time) return fail("invalid");
  }

  for (const change of changes) {
    if (change.op === "add" && change.after) {
      await createBlock(ctx, { template_id: change.template_id, ...change.after });
    } else if (change.op === "update" && change.after && change.block_id) {
      await updateBlock(ctx, change.block_id, change.after);
    } else if (change.op === "remove" && change.block_id) {
      await deleteBlock(ctx, change.block_id);
    }
  }
  return OK;
}

/** Edited values only replace what a change would become. What it's changing, and what from, stay as proposed. */
function withEdits(proposal: Proposal, edits: (BlockSnapshot | TemplateBlockSpec | null)[] | undefined): Proposal {
  if (!edits) return proposal;
  if (proposal.kind === "block_changes") {
    return {
      ...proposal,
      changes: proposal.changes.map((change, index) =>
        change.after && edits[index] ? { ...change, after: edits[index] as BlockSnapshot } : change
      ),
    };
  }
  return {
    ...proposal,
    changes: proposal.changes.map((change, index) =>
      change.after && edits[index] ? { ...change, after: edits[index] as TemplateBlockSpec } : change
    ),
  };
}

export async function approveProposal(
  ctx: ScheduleContext,
  id: string,
  edits?: (BlockSnapshot | TemplateBlockSpec | null)[]
): Promise<ActionResult> {
  const original = await ctx.repo.getProposal(id);
  if (!original) return fail("notFound");

  const now = nowOf(ctx);
  const status = effectiveStatus(original, now);
  if (status === "expired") {
    await ctx.repo.updateProposal(id, { status: "expired", decided_at: null });
    return fail("proposalExpired");
  }
  if (status !== "pending") return fail("proposalDecided");

  const proposal = withEdits(original, edits);
  const applied =
    proposal.kind === "block_changes"
      ? await applyBlockChanges(ctx, proposal.changes)
      : await applyTemplateChanges(ctx, proposal.changes);
  if (!applied.ok) return applied;

  await ctx.repo.updateProposal(id, { status: "approved", decided_at: now.toISOString(), changes: proposal.changes });
  await ctx.repo.addAudit({
    actor: "owner",
    action: "proposal_approved",
    entity: id,
    details: { kind: proposal.kind, edited: Boolean(edits), summary: proposal.summary },
  });
  return OK;
}

export async function rejectProposal(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  const proposal = await ctx.repo.getProposal(id);
  if (!proposal) return fail("notFound");
  if (proposal.status !== "pending") return fail("proposalDecided");

  await ctx.repo.updateProposal(id, { status: "rejected", decided_at: nowOf(ctx).toISOString() });
  await ctx.repo.addAudit({ actor: "owner", action: "proposal_rejected", entity: id, details: { summary: proposal.summary } });
  return OK;
}

/* Undo */

async function applyUndo(ctx: ScheduleContext, action: OracleAction): Promise<void> {
  const { undo } = action;
  switch (undo.kind) {
    case "delete_goal":
      return ctx.repo.deleteGoal(undo.id);
    case "delete_project":
      return ctx.repo.deleteProject(undo.id);
    case "delete_task":
      return ctx.repo.deleteTask(undo.id);
    case "restore_project": {
      const project = (await ctx.repo.listProjects()).find((candidate) => candidate.id === undo.id);
      if (!project) return;
      return ctx.repo.updateProject(undo.id, {
        goal_id: project.goal_id,
        title: project.title,
        status: project.status,
        progress_mode: undo.progress_mode,
        manual_percent: undo.manual_percent,
      });
    }
    case "restore_unit": {
      const unit = (await ctx.repo.listUnits()).find((candidate) => candidate.id === undo.id);
      if (!unit) return;
      return ctx.repo.updateUnit(undo.id, { track_id: unit.track_id, title: unit.title, position: unit.position, percent: undo.percent });
    }
    case "restore_review":
      return ctx.repo.saveWeeklyReview(undo.week_start, undo.text);
  }
}

export async function undoAction(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  const action = await ctx.repo.getAction(id);
  if (!action) return fail("notFound");
  if (action.undone_at) return fail("alreadyUndone");

  const now = nowOf(ctx);
  if (new Date(action.undo_until).getTime() < now.getTime()) return fail("undoExpired");

  await applyUndo(ctx, action);
  await ctx.repo.markActionUndone(id, now.toISOString());
  await ctx.repo.addAudit({ actor: "owner", action: "ai_action_undone", entity: action.tool, details: { summary: action.summary } });
  return OK;
}

/* Suggestion widget */

/** Cached for the day and regenerated at most 3 times, to save quota. */
export async function generateSuggestion(ctx: ScheduleContext, provider: AiProvider | null): Promise<ActionResult> {
  const existing = await ctx.repo.getSuggestion(ctx.today);
  if (existing && existing.generation_count >= SUGGESTIONS_PER_DAY) return fail("suggestionLimit");
  if (!provider) return fail("oracleUnavailable");
  if (!(await ctx.repo.bumpRateLimit(AI_RATE_LIMIT_PER_MINUTE, nowOf(ctx)))) return fail("rateLimited");

  try {
    const summary = await buildContextSummary(ctx);
    const language = ctx.locale === "zh-TW" ? "Traditional Chinese" : "English";
    const { text } = await provider.complete({
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${summary}` },
        { role: "user", content: `In one or two short sentences of ${language}, what should I do next, and why?` },
      ],
    });
    if (!text.trim()) return fail("oracleUnavailable");
    await ctx.repo.saveSuggestion({
      date: ctx.today,
      text: text.trim(),
      generation_count: (existing?.generation_count ?? 0) + 1,
    });
    return OK;
  } catch (error) {
    if (error instanceof ProviderError) return fail(error.code);
    throw error;
  }
}
