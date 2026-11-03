import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CATEGORY_COLOR, STATUS_META } from "@/features/schedule/components/meta";
import type { BlockInstance } from "@/features/schedule/types";
import { cn } from "@/lib/utils";

/** Today's loop in time order, scrolling sideways on a phone. */
export async function TodayTimeline({ blocks }: { blocks: BlockInstance[] }) {
  const t = await getTranslations("dashboard");

  return (
    <section aria-label={t("timelineLabel")} className="w-full">
      {blocks.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">{t("noBlocksToday")}</p>
      ) : (
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {blocks.map((block) => {
            const Icon = STATUS_META[block.status].icon;
            return (
              <li key={block.id} className="w-36 shrink-0">
                <Link
                  href="/loop"
                  className="flex h-full flex-col gap-1 rounded-lg bg-surface-2 p-2 text-left"
                  style={{ boxShadow: `inset 3px 0 0 ${CATEGORY_COLOR[block.category]}` }}
                >
                  <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    <Icon className={cn("size-3.5 shrink-0", STATUS_META[block.status].colorClass)} aria-hidden="true" />
                    {block.start_time}–{block.end_time}
                  </span>
                  <span className="line-clamp-2 text-sm break-words">{block.title}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
