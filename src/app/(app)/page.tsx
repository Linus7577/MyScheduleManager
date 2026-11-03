import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { RuneMark } from "@/components/shell/rune-mark";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getOwnerTimezone } from "@/features/settings/queries";
import { todayInTimeZone } from "@/lib/time/today";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const t = await getTranslations("home");
  const format = await getFormatter();
  const timeZone = await getOwnerTimezone();
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card className="glow-card">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <RuneMark className="size-24" />
          <p className="max-w-sm text-base">{t("flavor")}</p>
          <p className="text-sm text-muted-foreground">
            {t("today")}:{" "}
            <time dateTime={todayInTimeZone(timeZone, now)} className="text-foreground">
              {format.dateTime(now, { dateStyle: "full", timeZone })}
            </time>
          </p>
          <Link href="/loop" className={cn(buttonVariants(), "h-11 px-4")}>
            {t("openLoop")}
          </Link>
          <p className="text-xs text-muted-foreground">{t("sealed")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
