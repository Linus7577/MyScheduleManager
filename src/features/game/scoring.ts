import { isProductive, POWER_MIN } from "@/config/game.config";
import { durationMinutes } from "@/features/schedule/logic";
import type { BlockInstance, InstanceStatus, RestDay } from "@/features/schedule/types";
import {
  allocateCountedMinutes,
  clampPower,
  COLLAPSE_AFTER_CLOSEOUTS,
  collapsedXp,
  dayCountsForStreak,
  levelForXp,
  powerChange,
  roundPower,
  TIER_DEMOTION_AFTER_CLOSEOUTS,
  tierForLevel,
  tierRequiredLevel,
  xpEarned,
  xpLost,
} from "./engine";
import type {
  AuditEntry,
  DailySummary,
  GameValues,
  InstanceChange,
  LedgerReason,
  LedgerSource,
  NewLedgerEntry,
} from "./types";

type LedgerAmounts = { block_instance_id: string | null; delta_xp: number; delta_power: number };

export const STARTING_VALUES: Pick<GameValues, "total_xp" | "power" | "tier"> = { total_xp: 0, power: 100, tier: 1 };

/** Applies a change within the limits, and reports what really changed. XP stops at 0, and Power stays in 0–100. */
export function applyAmounts(values: GameValues, xp: number, power: number) {
  const totalXp = Math.max(0, values.total_xp + xp);
  const newPower = clampPower(values.power + power);
  return {
    appliedXp: totalXp - values.total_xp,
    appliedPower: roundPower(newPower - values.power),
    values: {
      ...values,
      total_xp: totalXp,
      power: newPower,
      // Tiers rise at once. Falling is handled at closeout, after three closeouts below the threshold.
      tier: Math.max(values.tier, tierForLevel(levelForXp(totalXp))),
    },
  };
}

function countableBlocks(blocks: BlockInstance[]) {
  return blocks
    .filter((block) => !block.is_cancelled && block.status !== "rest")
    .map((block) => ({ ...block, minutes: durationMinutes(block.start_time, block.end_time) }));
}

export function countedMinutesFor(blocks: BlockInstance[]): Map<string, number> {
  return allocateCountedMinutes(countableBlocks(blocks));
}

type ScoringDay = { closed: boolean; streakDays: number; tier: number };

/**
 * What a block should be worth right now. Done and partial score at check-off. Skipped only costs once the day
 * is closed, so you can change your mind until then.
 */
export function targetAmounts(block: BlockInstance, minutes: number, day: ScoringDay): { xp: number; power: number } {
  if (block.is_cancelled || !isProductive(block.category)) return { xp: 0, power: 0 };
  if (block.status === "done" || block.status === "partial") {
    return {
      xp: xpEarned({ minutes, category: block.category, status: block.status, streakDays: day.streakDays }),
      power: powerChange({ minutes, category: block.category, status: block.status }),
    };
  }
  if (block.status === "skipped" && day.closed) {
    return {
      xp: -xpLost({ minutes, category: block.category, tier: day.tier }),
      power: powerChange({ minutes, category: block.category, status: "skipped" }),
    };
  }
  return { xp: 0, power: 0 };
}

export function netForBlock(ledger: LedgerAmounts[], blockId: string) {
  let xp = 0;
  let power = 0;
  for (const entry of ledger) {
    if (entry.block_instance_id !== blockId) continue;
    xp += entry.delta_xp;
    power += entry.delta_power;
  }
  return { xp, power: roundPower(power) };
}

/**
 * Brings blocks to what they should be worth, by adding a ledger row for any difference. History is never edited,
 * and a block already at its value adds nothing, so this is safe to repeat.
 */
export function reconcileBlocks(input: {
  blocks: BlockInstance[];
  targets: BlockInstance[];
  ledger: LedgerAmounts[];
  values: GameValues;
  day: ScoringDay;
  date: string;
  source: LedgerSource;
  reasonFor: (block: BlockInstance) => LedgerReason;
}) {
  const counted = countedMinutesFor(input.blocks);
  const rows: NewLedgerEntry[] = [];
  let values = input.values;

  for (const block of input.targets) {
    const target = targetAmounts(block, counted.get(block.id) ?? 0, input.day);
    const net = netForBlock(input.ledger, block.id);
    const applied = applyAmounts(values, target.xp - net.xp, roundPower(target.power - net.power));
    values = applied.values;
    if (applied.appliedXp === 0 && applied.appliedPower === 0) continue;
    rows.push({
      date: input.date,
      source: input.source,
      block_instance_id: block.id,
      block_title: block.title,
      reason: input.reasonFor(block),
      delta_xp: applied.appliedXp,
      delta_power: applied.appliedPower,
      tier: values.tier,
    });
  }
  return { rows, values };
}

function minutesByStatus(blocks: BlockInstance[]) {
  const counted = countedMinutesFor(blocks);
  const sum = (statuses: InstanceStatus[]) =>
    blocks
      .filter((block) => !block.is_cancelled && isProductive(block.category) && statuses.includes(block.status))
      .reduce((total, block) => total + (counted.get(block.id) ?? 0), 0);
  return {
    planned_minutes: sum(["planned", "done", "partial", "skipped"]),
    done_minutes: sum(["done"]),
    partial_minutes: sum(["partial"]),
    skipped_minutes: sum(["skipped"]),
  };
}

function ledgerTotals(blocks: BlockInstance[], ledger: LedgerAmounts[]) {
  const ids = new Set(blocks.map((block) => block.id));
  let gained = 0;
  let lost = 0;
  let power = 0;
  for (const entry of ledger) {
    if (!entry.block_instance_id || !ids.has(entry.block_instance_id)) continue;
    if (entry.delta_xp > 0) gained += entry.delta_xp;
    else lost -= entry.delta_xp;
    power += entry.delta_power;
  }
  return { xp_gained: gained, xp_lost: lost, power_change: roundPower(power) };
}

export type CloseoutResult = {
  instances: InstanceChange[];
  ledger: NewLedgerEntry[];
  values: GameValues;
  summary: DailySummary;
  audit: AuditEntry[];
};

/**
 * "The Reckoning" for one day. In order:
 * 1. Unlogged planned blocks become skipped.
 * 2. Skipped blocks apply their XP loss and Power change.
 * 3. The streak, Power-zero counter and tier-demotion counter update.
 * 4. A daily summary is produced.
 *
 * Rest and Shield days, and days with nothing productive planned, are neutral: the streak and both counters hold.
 */
export function computeCloseout(input: {
  date: string;
  blocks: BlockInstance[];
  restDay: RestDay | null;
  ledger: LedgerAmounts[];
  values: GameValues;
  now: string;
}): CloseoutResult {
  const { date, restDay, now } = input;
  const before = input.values;

  const changes: InstanceChange[] = [];
  const blocks = input.blocks.map((block) => {
    if (block.is_cancelled || block.status !== "planned" || !isProductive(block.category)) return block;
    const status: InstanceStatus = restDay ? "rest" : "skipped";
    changes.push({ id: block.id, status, log_note: block.log_note, logged_at: block.logged_at });
    return { ...block, status };
  });

  const targets = blocks.filter((block) => block.status === "skipped" || block.category === "useful_youtube");
  const scored = reconcileBlocks({
    blocks,
    targets,
    ledger: input.ledger,
    values: before,
    day: { closed: true, streakDays: before.streak_days, tier: before.tier },
    date,
    source: "closeout",
    reasonFor: (block) => (block.status === "skipped" ? "skipped" : "block_changed"),
  });
  const rows = [...scored.rows];
  let values = scored.values;

  const minutes = minutesByStatus(blocks);
  const counted = restDay
    ? null
    : dayCountsForStreak({
        plannedMinutes: minutes.planned_minutes,
        doneMinutes: minutes.done_minutes,
        partialMinutes: minutes.partial_minutes,
      });

  let collapsed = false;
  let demoted = false;

  if (counted !== null) {
    values = { ...values, streak_days: counted ? values.streak_days + 1 : 0 };

    const powerZeroCount = values.power <= POWER_MIN ? values.power_zero_count + 1 : 0;
    values = { ...values, power_zero_count: powerZeroCount };

    if (powerZeroCount >= COLLAPSE_AFTER_CLOSEOUTS) {
      collapsed = true;
      const drop = collapsedXp(values.total_xp) - values.total_xp;
      const applied = applyAmounts(values, drop, 0);
      values = { ...applied.values, power_zero_count: 0 };
      if (applied.appliedXp !== 0) {
        rows.push({
          date,
          source: "collapse",
          block_instance_id: null,
          block_title: "",
          reason: "collapse",
          delta_xp: applied.appliedXp,
          delta_power: 0,
          tier: values.tier,
        });
      }
    }

    const belowTier = levelForXp(values.total_xp) < tierRequiredLevel(values.tier);
    const demotionCount = belowTier ? values.demotion_count + 1 : 0;
    if (demotionCount >= TIER_DEMOTION_AFTER_CLOSEOUTS) {
      demoted = true;
      values = { ...values, tier: Math.max(1, values.tier - 1), demotion_count: 0 };
    } else {
      values = { ...values, demotion_count: demotionCount };
    }
  }

  values = { ...values, last_closed_date: date };

  const totals = ledgerTotals(blocks, [...input.ledger, ...rows]);
  const nothingHappened = totals.xp_gained === 0 && totals.xp_lost === 0 && !collapsed && !demoted;
  const dayType = restDay ? restDay.kind : minutes.planned_minutes === 0 ? "empty" : "normal";

  const summary: DailySummary = {
    date,
    day_type: dayType,
    ...minutes,
    blocks_skipped: blocks.filter((block) => block.status === "skipped" && isProductive(block.category)).length,
    ...totals,
    counted,
    streak_before: before.streak_days,
    streak_after: values.streak_days,
    tier_before: before.tier,
    tier_after: values.tier,
    collapsed,
    demoted,
    // A quiet empty or rest day has nothing to announce, so it doesn't interrupt with a Reckoning screen.
    seen_at: dayType !== "normal" && nothingHappened ? now : null,
  };

  return {
    instances: changes,
    ledger: rows,
    values,
    summary,
    audit: [
      {
        actor: "system",
        action: "day_closeout",
        entity: date,
        details: { xp_gained: totals.xp_gained, xp_lost: totals.xp_lost, blocks_skipped: summary.blocks_skipped },
      },
    ],
  };
}

/** Rebuilds one closed day's numbers after a correction. */
export function recomputeSummary(summary: DailySummary, blocks: BlockInstance[], ledger: LedgerAmounts[]): DailySummary {
  const minutes = minutesByStatus(blocks);
  const counted =
    summary.day_type === "rest" || summary.day_type === "shield"
      ? null
      : dayCountsForStreak({
          plannedMinutes: minutes.planned_minutes,
          doneMinutes: minutes.done_minutes,
          partialMinutes: minutes.partial_minutes,
        });
  return {
    ...summary,
    ...minutes,
    ...ledgerTotals(blocks, ledger),
    blocks_skipped: blocks.filter((block) => block.status === "skipped" && isProductive(block.category)).length,
    counted,
  };
}

/** Replays the streak across closed days, oldest first. A correction can change the streak from that day forward. */
export function replayStreaks(summaries: DailySummary[]): DailySummary[] {
  let streak = summaries[0]?.streak_before ?? 0;
  return summaries.map((summary) => {
    const before = streak;
    if (summary.counted !== null) streak = summary.counted ? streak + 1 : 0;
    return { ...summary, streak_before: before, streak_after: streak };
  });
}

/** Rebuilds XP and Power from the ledger alone. The stored game state must always match this. */
export function replayLedger(ledger: { delta_xp: number; delta_power: number }[]) {
  let totalXp = STARTING_VALUES.total_xp;
  let power: number = STARTING_VALUES.power;
  for (const entry of ledger) {
    totalXp += entry.delta_xp;
    power += entry.delta_power;
  }
  return { total_xp: totalXp, power: roundPower(power) };
}
