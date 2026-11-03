import { getFormatter, getTranslations } from "next-intl/server";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { WidgetLink } from "@/features/command/components/widgets";
import type { ScheduleContext } from "@/features/schedule/generation";
import { getPortfolioSummary, getSpendingSummary } from "../service";
import { categoryLabel, moneyFormat, signedMoneyFormat } from "./format";

export async function SpendingWidget({ ctx }: { ctx: ScheduleContext }) {
  const t = await getTranslations("finance");
  const names = await getTranslations("financeCategories");
  const format = await getFormatter();
  const { summary, alerts, categories } = await getSpendingSummary(ctx);
  const money = (value: number) => format.number(value, moneyFormat("TWD"));

  return (
    <>
      <p className="text-2xl font-semibold tabular-nums">{money(summary.expense)}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {t("widgetIncomeNet", { income: money(summary.income), net: format.number(summary.net, signedMoneyFormat("TWD")) })}
      </p>
      {alerts.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {alerts.map((alert) => {
            const Icon = alert.level === "over" ? CircleAlert : TriangleAlert;
            return (
              <li key={alert.category_id} className="flex items-center gap-1.5">
                <Icon className="size-4 shrink-0 text-ember-400" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  {t("widgetBudgetLine", {
                    category: categoryLabel(
                      categories.find((category) => category.id === alert.category_id),
                      (key) => names(key)
                    ),
                    percent: alert.percent,
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-4">
        <WidgetLink href="/finance?add=1">{t("add")}</WidgetLink>
        <WidgetLink href="/finance">{t("openTreasury")}</WidgetLink>
      </div>
    </>
  );
}

export async function PortfolioWidget({ ctx }: { ctx: ScheduleContext }) {
  const t = await getTranslations("finance");
  const format = await getFormatter();
  const { hasTrades, totals } = await getPortfolioSummary(ctx);

  return (
    <>
      {hasTrades ? (
        <>
          <p className="text-2xl font-semibold tabular-nums">{format.number(totals.value_twd, moneyFormat("TWD"))}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("widgetUnrealized", { amount: format.number(totals.unrealized_twd, signedMoneyFormat("TWD")) })}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noHoldings")}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("disclaimer")}</p>
      <WidgetLink href="/finance/portfolio">{t("openPortfolio")}</WidgetLink>
    </>
  );
}
