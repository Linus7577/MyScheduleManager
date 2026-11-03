import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { EXPENSE_COLOR, INCOME_COLOR } from "@/features/command/components/chart-palette";
import { BudgetBanner } from "@/features/finance/components/budget-alerts";
import { MonthTrendChart, YearTrendChart } from "@/features/finance/components/chart-loaders";
import { categoryLabel, moneyFormat, signedMoneyFormat, toUtcDate } from "@/features/finance/components/format";
import { FxAttribution } from "@/features/finance/components/fx-attribution";
import { MarketRefresher } from "@/features/finance/components/market-refresher";
import { QuickAdd } from "@/features/finance/components/quick-add";
import { TransactionsList } from "@/features/finance/components/transactions-list";
import { shiftPeriod, type CategoryTotal } from "@/features/finance/logic";
import { ensureFinanceReady, getFinanceOverview, getSpendingSummary, hasStaleRates } from "@/features/finance/service";
import type { FinanceView, FinCategory } from "@/features/finance/types";
import { getScheduleContext } from "@/features/schedule/context";
import { dateSchema } from "@/features/schedule/schema";
import { cn } from "@/lib/utils";

const paramsSchema = z.object({
  view: z.enum(["day", "month", "year"]).catch("month"),
  date: dateSchema.optional().catch(undefined),
  add: z.string().optional().catch(undefined),
});

const VIEWS: FinanceView[] = ["day", "month", "year"];

function Breakdown(props: {
  title: string;
  rows: CategoryTotal[];
  categories: FinCategory[];
  color: string;
  label: (category: FinCategory | undefined) => string;
  money: (value: number) => string;
}) {
  if (props.rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="text-base font-semibold">{props.title}</h2>
      <ul className="flex flex-col gap-3">
        {props.rows.map((row) => (
          <li key={row.category_id} className="flex flex-col gap-1 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 break-words">{props.label(props.categories.find((category) => category.id === row.category_id))}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {props.money(row.total)} · {row.percent}%
              </span>
            </div>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${Math.max(row.percent, 1)}%`, backgroundColor: props.color }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getTranslations("finance");
  const names = await getTranslations("financeCategories");
  const format = await getFormatter();
  const ctx = await getScheduleContext();
  await ensureFinanceReady(ctx);

  const params = paramsSchema.parse(await searchParams);
  const { view } = params;
  const date = params.date ?? ctx.today;

  const [overview, spending] = await Promise.all([getFinanceOverview(ctx, view, date), getSpendingSummary(ctx)]);
  const { summary, categories } = overview;

  const money = (value: number) => format.number(value, moneyFormat("TWD"));
  const label = (category: FinCategory | undefined) => categoryLabel(category, (key) => names(key));
  const href = (nextView: FinanceView, nextDate: string) => `/finance?view=${nextView}&date=${nextDate}`;

  const utc = toUtcDate(date);
  const periodLabel =
    view === "day"
      ? format.dateTime(utc, { dateStyle: "full", timeZone: "UTC" })
      : view === "month"
        ? format.dateTime(utc, { year: "numeric", month: "long", timeZone: "UTC" })
        : format.dateTime(utc, { year: "numeric", timeZone: "UTC" });

  return (
    <>
      <MarketRefresher stale={hasStaleRates(overview.rates, ctx.today)} />
      <BudgetBanner alerts={spending.alerts} categories={spending.categories} />

      <QuickAdd categories={categories} rates={overview.rates} today={ctx.today} startOpen={params.add === "1"} />

      <div className="grid grid-cols-3 gap-1" role="group" aria-label={t("viewLabel")}>
        {VIEWS.map((option) => (
          <Link
            key={option}
            href={href(option, date)}
            aria-current={option === view ? "true" : undefined}
            className={cn(
              "flex h-10 items-center justify-center rounded-lg text-sm",
              option === view ? "bg-surface-2 ring-1 ring-foreground/20" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`views.${option}`)}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link href={href(view, shiftPeriod(view, date, -1))} aria-label={t("previousPeriod")} className="flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/15">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <h2 className="min-w-0 text-center text-base font-semibold">{periodLabel}</h2>
        <Link href={href(view, shiftPeriod(view, date, 1))} aria-label={t("nextPeriod")} className="flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/15">
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <section aria-label={t("totalsLabel")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { key: "income", value: money(summary.income) },
          { key: "expense", value: money(summary.expense) },
          { key: "net", value: format.number(summary.net, signedMoneyFormat("TWD")) },
        ].map((tile) => (
          <div key={tile.key} className="min-w-0 rounded-xl bg-card p-3 ring-1 ring-foreground/10 last:col-span-2 sm:last:col-span-1">
            <p className="text-xs text-muted-foreground">{t(tile.key)}</p>
            <p className="mt-0.5 text-base font-semibold break-words tabular-nums">{tile.value}</p>
          </div>
        ))}
      </section>

      {overview.trend && summary.income + summary.expense > 0 && (
        <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="text-base font-semibold">{t(view === "month" ? "spendingByDay" : "incomeVsExpense")}</h2>
          {view === "month" ? <MonthTrendChart data={overview.trend} /> : <YearTrendChart data={overview.trend} />}
        </section>
      )}

      <Breakdown title={t("spendingByCategory")} rows={overview.expenses} categories={categories} color={EXPENSE_COLOR} label={label} money={money} />
      <Breakdown title={t("incomeByCategory")} rows={overview.income} categories={categories} color={INCOME_COLOR} label={label} money={money} />

      {view !== "year" && (
        <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="text-base font-semibold">{t("transactions")}</h2>
          <TransactionsList transactions={overview.transactions} categories={categories} />
        </section>
      )}

      <FxAttribution />
    </>
  );
}
