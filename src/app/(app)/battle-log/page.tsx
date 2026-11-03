import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, ScrollText, Skull, Swords, Undo2, type LucideIcon } from "lucide-react";
import type { LedgerSource } from "@/features/game/types";
import { getScheduleContext } from "@/features/schedule/context";
import { cn } from "@/lib/utils";

const LOG_LIMIT = 200;

const SOURCE_META: Record<LedgerSource, { icon: LucideIcon; colorClass: string }> = {
  block: { icon: Swords, colorClass: "text-ember-400" },
  closeout: { icon: Skull, colorClass: "text-crimson-400" },
  correction: { icon: Undo2, colorClass: "text-bone-300" },
  collapse: { icon: Skull, colorClass: "text-crimson-400" },
};

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

export default async function BattleLogPage() {
  const t = await getTranslations("battleLog");
  const format = await getFormatter();
  const ctx = await getScheduleContext();
  const entries = await ctx.repo.listLedger(LOG_LIMIT);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/more" className="flex h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-4 py-10 text-center ring-1 ring-foreground/10">
          <ScrollText className="size-8 text-crimson-400" aria-hidden="true" />
          <p className="max-w-sm text-base">{t("empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl bg-card px-4 ring-1 ring-foreground/10">
          {entries.map((entry) => {
            const Icon = SOURCE_META[entry.source].icon;
            return (
              <li key={entry.id} className="flex items-center gap-3 py-3">
                <Icon className={cn("size-5 shrink-0", SOURCE_META[entry.source].colorClass)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{entry.block_title || t(`reason.${entry.reason}`)}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.block_title && `${t(`reason.${entry.reason}`)} · `}
                    {format.dateTime(new Date(`${entry.date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums">
                  {entry.delta_xp !== 0 && (
                    <p className={entry.delta_xp > 0 ? "text-ember-400" : "text-crimson-400"}>
                      {t("xpAmount", { amount: signed(entry.delta_xp) })}
                    </p>
                  )}
                  {entry.delta_power !== 0 && (
                    <p className="text-muted-foreground">{t("powerAmount", { amount: signed(entry.delta_power) })}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
