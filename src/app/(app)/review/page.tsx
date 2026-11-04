import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/features/command/components/progress-bar";
import { categoryLabel, moneyFormat, signedMoneyFormat } from "@/features/finance/components/format";
import { PowerLine } from "@/features/review/components/power-line";
import { WeeklyPrompts, WriteReviewButton } from "@/features/review/components/review-forms";
import { getReviewView } from "@/features/review/service";
import { getScheduleContext } from "@/features/schedule/context";
import { addDays } from "@/features/schedule/logic";
import { dateSchema } from "@/features/schedule/schema";

function Tile(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <p className="text-xs text-muted-foreground">{props.label}</p>
      <p className="text-lg font-semibold tabular-nums">{props.value}</p>
    </div>
  );
}

export default async function ReviewPage(props: { searchParams: Promise<{ week?: string }> }) {
  const [t, categories, finance, format, ctx, params] = await Promise.all([
    getTranslations("review"),
    getTranslations("categories"),
    getTranslations("finance"),
    getFormatter(),
    getScheduleContext(),
    props.searchParams,
  ]);
  const asked = dateSchema.safeParse(params.week);
  // A week still to come has nothing to review, so the address can't reach one.
  const week = asked.success && asked.data <= ctx.today ? asked.data : ctx.today;
  const { stats, spending, oracleText, answers, hasNextWeek } = await getReviewView(ctx, week);

  const dayLabel = (date: string) => format.dateTime(new Date(`${date}T00:00:00Z`), { weekday: "short", timeZone: "UTC" });
  const shortDate = (date: string) => format.dateTime(new Date(`${date}T00:00:00Z`), { month: "numeric", day: "numeric", timeZone: "UTC" });
  const signed = (value: number) => format.number(value, { signDisplay: "exceptZero", maximumFractionDigits: 1 });
  const money = (value: number) => format.number(value, moneyFormat("TWD"));
  const hours = (minutes: number) => format.number(minutes / 60, { maximumFractionDigits: 1 });
  const nav = "flex size-11 items-center justify-center rounded-lg ring-1 ring-foreground/15 hover:bg-surface-2";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="flex items-center justify-between gap-2">
        <Link href={`/review?week=${addDays(stats.weekStart, -7)}`} aria-label={t("previousWeek")} className={nav}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <p className="text-sm font-medium tabular-nums">
          {t("weekRange", { from: shortDate(stats.weekStart), to: shortDate(stats.weekEnd) })}
        </p>
        {hasNextWeek ? (
          <Link href={`/review?week=${addDays(stats.weekStart, 7)}`} aria-label={t("nextWeek")} className={nav}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Eye className="size-4 text-crimson-400" aria-hidden="true" />
            {t("oracleTitle")}
          </h2>
          {oracleText ? (
            <p className="text-sm whitespace-pre-wrap">{oracleText}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("oracleEmpty")}</p>
          )}
          <WriteReviewButton week={stats.weekStart} rewrite={Boolean(oracleText)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">{t("numbersTitle")}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile label={t("xpGained")} value={format.number(stats.xpGained)} />
            <Tile label={t("xpLost")} value={format.number(stats.xpLost)} />
            <Tile label={t("powerChange")} value={signed(stats.powerChange)} />
            <Tile label={t("streak")} value={t("streakDays", { days: stats.streak })} />
            <Tile label={t("restUsed")} value={format.number(stats.restDays)} />
            <Tile label={t("shieldsUsed")} value={format.number(stats.shields)} />
          </div>
          {stats.power.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("powerTrend")}</h3>
              <PowerLine days={stats.power} labelFor={dayLabel} title={t("powerTrend")} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t("minutesTitle")}</h2>
          {stats.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("minutesEmpty")}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t("minutesTotal", { done: hours(stats.done), planned: hours(stats.planned) })}
              </p>
              <ul className="flex flex-col gap-3">
                {stats.categories.map((row) => (
                  <li key={row.category} className="flex flex-col gap-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span>{categories(row.category)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {t("minutesRow", { done: row.done, planned: row.planned })}
                      </span>
                    </div>
                    <ProgressBar
                      percent={row.planned > 0 ? Math.min(Math.round((row.done / row.planned) * 100), 100) : 0}
                      label={categories(row.category)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t("goalsTitle")}</h2>
          {stats.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("goalsEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {stats.goals.map((goal) => (
                <li key={goal.id} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{goal.title}</span>
                    {goal.change !== null && (
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {t("goalChange", { change: signed(goal.change) })}
                      </span>
                    )}
                  </div>
                  <ProgressBar percent={goal.percent} label={goal.title} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t("spendingTitle")}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Tile label={t("spent")} value={money(spending.summary.expense)} />
            <Tile label={t("net")} value={format.number(spending.summary.net, signedMoneyFormat("TWD"))} />
          </div>
          {spending.top.length > 0 && (
            <ul className="flex flex-col divide-y text-sm">
              {spending.top.map((row) => (
                <li key={row.category_id} className="flex justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">
                    {categoryLabel(spending.categories.find((category) => category.id === row.category_id), finance)}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{money(row.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{t("spendingNote")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t("promptsTitle")}</h2>
          <WeeklyPrompts key={stats.weekStart} week={stats.weekStart} answers={answers} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <h2 className="text-base font-semibold">{t("adjustTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("adjustHint")}</p>
          <Link
            href="/oracle?ask=adjust"
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm ring-1 ring-foreground/15 hover:bg-surface-2"
          >
            {t("adjustButton")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
