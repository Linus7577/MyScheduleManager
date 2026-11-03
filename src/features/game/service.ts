import { CORRECTION_WINDOW_HOURS } from "@/config/game.config";
import { generateMissingInstances, type ScheduleContext } from "@/features/schedule/generation";
import { addDays, crossesMidnight, datesBetween } from "@/features/schedule/logic";
import type { ActionResult, BlockInstance, InstanceStatus, ScheduleErrorCode } from "@/features/schedule/types";
import { levelForXp, levelProgressPercent, powerStateFor } from "./engine";
import { computeCloseout, netForBlock, reconcileBlocks, recomputeSummary, replayLedger, replayStreaks } from "./scoring";
import type { DailySummary, GameState, GameValues, LedgerReason } from "./types";

const OK: ActionResult = { ok: true };
const fail = (code: ScheduleErrorCode): ActionResult => ({ ok: false, code });

const COMMIT_ATTEMPTS = 3;
const MS_PER_HOUR = 3_600_000;

const toValues = (state: GameState): GameValues => ({
  total_xp: state.total_xp,
  power: state.power,
  tier: state.tier,
  streak_days: state.streak_days,
  power_zero_count: state.power_zero_count,
  demotion_count: state.demotion_count,
  last_closed_date: state.last_closed_date,
});

export async function ensureGameState(ctx: ScheduleContext): Promise<GameState> {
  const existing = await ctx.repo.getGameState();
  if (existing) return existing;
  await ctx.repo.createGameState();
  const created = await ctx.repo.getGameState();
  if (!created) throw new Error("Could not create the game state");
  return created;
}

async function dayBlocks(ctx: ScheduleContext, date: string): Promise<BlockInstance[]> {
  return (await ctx.repo.listInstances(date, date)).filter((block) => !block.is_cancelled);
}

/* Closeout */

/** A planned block running past midnight keeps its day open until it ends. */
function waitingForBlock(blocks: BlockInstance[], date: string, wallClock: string | undefined): boolean {
  if (!wallClock) return false;
  return blocks.some((block) => {
    if (block.status !== "planned" || !crossesMidnight(block.start_time, block.end_time)) return false;
    return `${addDays(date, 1)}T${block.end_time}:00` > wallClock;
  });
}

async function closeDay(ctx: ScheduleContext, date: string): Promise<"closed" | "waiting" | "conflict"> {
  const blocks = await dayBlocks(ctx, date);
  if (waitingForBlock(blocks, date, ctx.wallClock)) return "waiting";

  const [state, restDays, ledger] = await Promise.all([
    ensureGameState(ctx),
    ctx.repo.listRestDays(date, date),
    ctx.repo.listLedgerForBlocks(blocks.map((block) => block.id)),
  ]);

  const result = computeCloseout({
    date,
    blocks,
    restDay: restDays[0] ?? null,
    ledger,
    values: toValues(state),
    now: (ctx.now ?? new Date()).toISOString(),
  });

  const committed = await ctx.repo.commitGame({
    expected_version: state.version,
    close_date: date,
    instances: result.instances,
    ledger: result.ledger,
    state: result.values,
    summaries: [result.summary],
    audit: result.audit,
  });
  return committed ? "closed" : "conflict";
}

/**
 * Closes every finished day that isn't closed yet, oldest first. Safe to run at any time, from anywhere:
 * closed_days allows each date once, so a second run changes nothing.
 */
export async function runPendingCloseouts(ctx: ScheduleContext): Promise<number> {
  const yesterday = addDays(ctx.today, -1);
  const state = await ensureGameState(ctx);
  if (state.last_closed_date && state.last_closed_date >= yesterday) return 0;

  await generateMissingInstances(ctx);

  const start = state.last_closed_date ? addDays(state.last_closed_date, 1) : await ctx.repo.earliestInstanceDate();
  if (!start || start > yesterday) return 0;

  let closed = 0;
  for (const date of datesBetween(start, yesterday)) {
    const outcome = await closeDay(ctx, date);
    if (outcome !== "closed") break;
    closed += 1;
  }
  return closed;
}

/* Logging and rescoring */

function reasonForStatus(status: InstanceStatus): LedgerReason {
  if (status === "done") return "block_done";
  if (status === "partial") return "block_partial";
  return "block_changed";
}

function correctionExpired(closedAt: string, now: Date): boolean {
  return now.getTime() - new Date(closedAt).getTime() > CORRECTION_WINDOW_HOURS * MS_PER_HOUR;
}

/**
 * Sets a block's status and scores the difference. Before closeout it can change freely.
 * After closeout it's a correction: allowed within 24 hours, and recorded as new ledger rows.
 */
export async function logBlock(
  ctx: ScheduleContext,
  id: string,
  status: Exclude<InstanceStatus, "rest">,
  logNote: string
): Promise<ActionResult> {
  const now = ctx.now ?? new Date();

  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt++) {
    const instance = await ctx.repo.getInstance(id);
    if (!instance) return fail("notFound");
    if (instance.date > ctx.today) return fail("futureBlock");
    if (instance.status === "rest" || instance.is_cancelled) return fail("notLoggable");

    const closedDay = await ctx.repo.getClosedDay(instance.date);
    if (closedDay) {
      if (correctionExpired(closedDay.created_at, now)) return fail("correctionExpired");
      if (status === "planned") return fail("correctionNeedsStatus");
    }

    const committed = closedDay
      ? await commitCorrection(ctx, instance, status, logNote, now)
      : await commitOpenDayLog(ctx, instance, status, logNote, now);
    if (committed) return OK;
  }
  return fail("failed");
}

const withStatus = (blocks: BlockInstance[], id: string, status: InstanceStatus) =>
  blocks.map((block) => (block.id === id ? { ...block, status } : block));

/** Only this block and the day's videos can change value. The videos share one 60-minute allowance. */
const blocksToRescore = (blocks: BlockInstance[], id: string) =>
  blocks.filter((block) => block.id === id || block.category === "useful_youtube");

async function commitOpenDayLog(
  ctx: ScheduleContext,
  instance: BlockInstance,
  status: Exclude<InstanceStatus, "rest">,
  logNote: string,
  now: Date
): Promise<boolean> {
  const state = await ensureGameState(ctx);
  const blocks = withStatus(await dayBlocks(ctx, instance.date), instance.id, status);
  const targets = blocksToRescore(blocks, instance.id);
  const ledger = await ctx.repo.listLedgerForBlocks(targets.map((block) => block.id));

  const scored = reconcileBlocks({
    blocks,
    targets,
    ledger,
    values: toValues(state),
    day: { closed: false, streakDays: state.streak_days, tier: state.tier },
    date: instance.date,
    source: "block",
    reasonFor: (block) => (block.id === instance.id ? reasonForStatus(status) : "block_changed"),
  });

  return ctx.repo.commitGame({
    expected_version: state.version,
    close_date: null,
    instances: [
      { id: instance.id, status, log_note: logNote, logged_at: status === "planned" ? null : now.toISOString() },
    ],
    ledger: scored.rows,
    state: scored.values,
    summaries: [],
    audit: [],
  });
}

async function commitCorrection(
  ctx: ScheduleContext,
  instance: BlockInstance,
  status: Exclude<InstanceStatus, "rest">,
  logNote: string,
  now: Date
): Promise<boolean> {
  const [state, summary] = await Promise.all([ensureGameState(ctx), ctx.repo.getSummary(instance.date)]);
  if (!summary) throw new Error("A closed day has no summary");

  const blocks = withStatus(await dayBlocks(ctx, instance.date), instance.id, status);
  const targets = blocksToRescore(blocks, instance.id);
  const ledger = await ctx.repo.listLedgerForBlocks(blocks.map((block) => block.id));

  const scored = reconcileBlocks({
    blocks,
    targets,
    ledger,
    values: toValues(state),
    // The day is scored as it stood then. Later days keep the XP they already earned.
    day: { closed: true, streakDays: summary.streak_before, tier: summary.tier_before },
    date: instance.date,
    source: "correction",
    reasonFor: () => "correction",
  });

  const corrected = recomputeSummary(summary, blocks, [...ledger, ...scored.rows]);
  const later = (await ctx.repo.listSummariesFrom(instance.date)).filter((day) => day.date !== instance.date);
  const summaries: DailySummary[] = replayStreaks([corrected, ...later]);
  const latestStreak = summaries.at(-1)?.streak_after ?? scored.values.streak_days;

  return ctx.repo.commitGame({
    expected_version: state.version,
    close_date: null,
    instances: [{ id: instance.id, status, log_note: logNote, logged_at: now.toISOString() }],
    ledger: scored.rows,
    state: { ...scored.values, streak_days: latestStreak },
    summaries,
    audit: [{ actor: "owner", action: "correction", entity: instance.date, details: { block: instance.id, status } }],
  });
}

/** Re-scores a logged block after its time or category changed. */
export async function rescoreBlock(ctx: ScheduleContext, id: string): Promise<void> {
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt++) {
    const instance = await ctx.repo.getInstance(id);
    if (!instance) return;
    const state = await ensureGameState(ctx);
    const blocks = await dayBlocks(ctx, instance.date);
    const targets = blocksToRescore(blocks, id);
    const ledger = await ctx.repo.listLedgerForBlocks(targets.map((block) => block.id));
    const scored = reconcileBlocks({
      blocks,
      targets,
      ledger,
      values: toValues(state),
      day: { closed: false, streakDays: state.streak_days, tier: state.tier },
      date: instance.date,
      source: "block",
      reasonFor: () => "block_changed",
    });
    if (scored.rows.length === 0) return;
    const committed = await ctx.repo.commitGame({
      expected_version: state.version,
      close_date: null,
      instances: [],
      ledger: scored.rows,
      state: scored.values,
      summaries: [],
      audit: [],
    });
    if (committed) return;
  }
  throw new Error("Could not re-score the block");
}

/** Takes back everything a block earned, before it's removed. */
export async function reverseBlock(ctx: ScheduleContext, instance: BlockInstance): Promise<void> {
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt++) {
    const state = await ensureGameState(ctx);
    const ledger = await ctx.repo.listLedgerForBlocks([instance.id]);
    const net = netForBlock(ledger, instance.id);
    if (net.xp === 0 && net.power === 0) return;

    const scored = reconcileBlocks({
      blocks: [],
      targets: [{ ...instance, is_cancelled: true }],
      ledger,
      values: toValues(state),
      day: { closed: false, streakDays: state.streak_days, tier: state.tier },
      date: instance.date,
      source: "block",
      reasonFor: () => "block_removed",
    });
    const committed = await ctx.repo.commitGame({
      expected_version: state.version,
      close_date: null,
      instances: [],
      ledger: scored.rows,
      state: scored.values,
      summaries: [],
      audit: [],
    });
    if (committed) return;
  }
  throw new Error("Could not reverse the block");
}

/* Reading */

export type GameView = {
  totalXp: number;
  level: number;
  tier: number;
  power: number;
  powerState: ReturnType<typeof powerStateFor>;
  xpProgressPercent: number;
  streakDays: number;
  armorFailing: boolean;
  powerZeroCount: number;
  seenLevel: number;
  seenTier: number;
};

export async function getGameView(ctx: ScheduleContext): Promise<GameView> {
  const state = await ensureGameState(ctx);
  return {
    totalXp: state.total_xp,
    level: levelForXp(state.total_xp),
    tier: state.tier,
    power: state.power,
    powerState: powerStateFor(state.power),
    xpProgressPercent: levelProgressPercent(state.total_xp),
    streakDays: state.streak_days,
    armorFailing: state.demotion_count > 0,
    powerZeroCount: state.power_zero_count,
    seenLevel: state.seen_level,
    seenTier: state.seen_tier,
  };
}

export type ReckoningView = {
  days: number;
  firstDate: string;
  lastDate: string;
  xpGained: number;
  xpLost: number;
  powerChange: number;
  blocksSkipped: number;
  streak: number;
  armorFailing: boolean;
  collapsed: boolean;
  demoted: boolean;
};

export async function getReckoning(ctx: ScheduleContext): Promise<ReckoningView | null> {
  const unseen = await ctx.repo.listUnseenSummaries();
  if (unseen.length === 0) return null;
  const state = await ensureGameState(ctx);
  return {
    days: unseen.length,
    firstDate: unseen[0].date,
    lastDate: unseen[unseen.length - 1].date,
    xpGained: unseen.reduce((total, day) => total + day.xp_gained, 0),
    xpLost: unseen.reduce((total, day) => total + day.xp_lost, 0),
    powerChange: Math.round(unseen.reduce((total, day) => total + day.power_change, 0) * 1000) / 1000,
    blocksSkipped: unseen.reduce((total, day) => total + day.blocks_skipped, 0),
    streak: state.streak_days,
    armorFailing: state.demotion_count > 0,
    collapsed: unseen.some((day) => day.collapsed),
    demoted: unseen.some((day) => day.demoted),
  };
}

export async function dismissReckoning(ctx: ScheduleContext): Promise<ActionResult> {
  await ctx.repo.markSummariesSeen((ctx.now ?? new Date()).toISOString());
  return OK;
}

export async function acknowledgeProgress(ctx: ScheduleContext): Promise<ActionResult> {
  const state = await ensureGameState(ctx);
  await ctx.repo.setSeenProgress(levelForXp(state.total_xp), state.tier);
  return OK;
}

export async function recordFocusBroken(ctx: ScheduleContext, id: string): Promise<ActionResult> {
  const instance = await ctx.repo.getInstance(id);
  if (!instance) return fail("notFound");
  await ctx.repo.updateInstance(id, { focus_broken_count: instance.focus_broken_count + 1 });
  return OK;
}

/** Confirms the cached state still matches the ledger, which is what makes it safe to treat as a cache. */
export async function verifyStateMatchesLedger(ctx: ScheduleContext): Promise<boolean> {
  const [state, ledger] = await Promise.all([ensureGameState(ctx), ctx.repo.listAllLedger()]);
  const replayed = replayLedger(ledger);
  return replayed.total_xp === state.total_xp && replayed.power === state.power;
}
