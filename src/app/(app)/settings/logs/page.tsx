import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, ScrollText } from "lucide-react";
import { getOwnerTimezone } from "@/features/settings/queries";
import { getScheduleContext } from "@/features/schedule/context";

const LOG_LIMIT = 200;

export default async function LogsPage() {
  const t = await getTranslations("logs");
  const format = await getFormatter();
  const ctx = await getScheduleContext();
  const [entries, timeZone] = await Promise.all([ctx.repo.listAudit(LOG_LIMIT), getOwnerTimezone()]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/settings" className="flex h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-4 py-10 text-center ring-1 ring-foreground/10">
          <ScrollText className="size-8 text-crimson-400" aria-hidden="true" />
          <p className="max-w-sm text-base">{t("empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl bg-card px-4 ring-1 ring-foreground/10">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5 py-3">
              <p className="text-sm">
                {t.has(`actions.${entry.action}`) ? t(`actions.${entry.action}`) : entry.action}
                <span className="text-muted-foreground"> · {t(`actors.${entry.actor}`)}</span>
              </p>
              {typeof entry.details?.summary === "string" && (
                <p className="text-sm break-words text-muted-foreground">{entry.details.summary}</p>
              )}
              <time className="text-xs text-muted-foreground" dateTime={entry.created_at}>
                {format.dateTime(new Date(entry.created_at), { dateStyle: "medium", timeStyle: "short", timeZone })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
