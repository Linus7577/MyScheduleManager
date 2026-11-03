import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, weekDates, weekStart } from "../logic";

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);

export async function WeekStrip({ date, today }: { date: string; today: string }) {
  const format = await getFormatter();
  const t = await getTranslations("loop");
  const start = weekStart(date);

  return (
    <nav aria-label={t("weekLabel")} className="flex items-center gap-1">
      <Link
        href={`/loop?date=${addDays(start, -7)}`}
        aria-label={t("previousWeek")}
        className="flex h-14 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
      <ol className="grid flex-1 grid-cols-7 gap-1">
        {weekDates(date).map((day) => {
          const selected = day === date;
          return (
            <li key={day}>
              <Link
                href={`/loop?date=${day}`}
                aria-current={selected ? "date" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center rounded-lg text-xs transition-colors",
                  selected ? "bg-crimson-950 text-bone-50 ring-1 ring-crimson-500" : "hover:bg-surface-2",
                  !selected && day !== today && "text-muted-foreground",
                  !selected && day === today && "text-crimson-400"
                )}
              >
                <span>{format.dateTime(asUtc(day), { weekday: "short", timeZone: "UTC" })}</span>
                <span className="text-sm font-medium tabular-nums">
                  {format.dateTime(asUtc(day), { day: "numeric", timeZone: "UTC" })}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <Link
        href={`/loop?date=${addDays(start, 7)}`}
        aria-label={t("nextWeek")}
        className="flex h-14 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </nav>
  );
}
