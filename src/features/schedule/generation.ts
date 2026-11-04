import type { BackupRepo } from "@/features/backup/repo";
import type { NotificationRepo } from "@/features/notifications/repo";
import type { CommandRepo } from "@/features/command/repo";
import type { FinanceRepo } from "@/features/finance/repo";
import type { VaultRepo } from "@/features/vault/repo";
import type { GameRepo } from "@/features/game/repo";
import type { OracleRepo } from "@/features/oracle/repo";
import { addDays, buildInstanceRows, generationEnd } from "./logic";
import type { ScheduleRepo } from "./repo";

export type AppRepo = ScheduleRepo & GameRepo & CommandRepo & OracleRepo & FinanceRepo & VaultRepo & NotificationRepo & BackupRepo;

export type ScheduleContext = {
  repo: AppRepo;
  today: string;
  /** The real moment now. Used for correction windows. */
  now?: Date;
  /** The owner's local time now, as YYYY-MM-DDTHH:mm:ss. Used to wait for blocks running past midnight. */
  wallClock?: string;
  /** The language to write generated text in, where the owner's own message doesn't set one. */
  locale?: string;
};

export async function generateInstances(ctx: ScheduleContext, from: string, to: string): Promise<void> {
  if (from > to) return;
  const [activations, blocks, restDays] = await Promise.all([
    ctx.repo.listActivations(),
    ctx.repo.listBlocks(),
    ctx.repo.listRestDays(from, to),
  ]);
  const rows = buildInstanceRows({
    from,
    to,
    activations,
    blocks,
    restDates: new Set(restDays.map((day) => day.date)),
  });
  await ctx.repo.insertInstances(rows);
}

/**
 * Generates any days not generated yet, up to the end of next week. Days already generated are never redone,
 * so a block added today can't appear on a past date, while days missed while the app was closed still appear.
 */
export async function generateMissingInstances(ctx: ScheduleContext): Promise<void> {
  const latest = await ctx.repo.latestTemplateInstanceDate();
  const end = generationEnd(ctx.today);
  if (latest && latest >= end) return;
  await generateInstances(ctx, latest ? addDays(latest, 1) : ctx.today, end);
}
