import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { BudgetStatus, FinCategory } from "../types";
import { categoryLabel, moneyFormat } from "./format";

/** The in-app alert when a budget reaches 80% or 100% of this month's amount. */
export async function BudgetBanner({ alerts, categories }: { alerts: BudgetStatus[]; categories: FinCategory[] }) {
  const t = await getTranslations("finance");
  const names = await getTranslations("financeCategories");
  const format = await getFormatter();
  if (alerts.length === 0) return null;

  return (
    <section
      aria-label={t("budgetBannerLabel")}
      className="flex flex-col gap-2 rounded-xl bg-ember-950 p-4 text-sm text-ember-100 ring-1 ring-ember-800"
    >
      <ul className="flex flex-col gap-1.5">
        {alerts.map((alert) => {
          const Icon = alert.level === "over" ? CircleAlert : TriangleAlert;
          return (
            <li key={alert.category_id} className="flex items-start gap-2">
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {t(alert.level === "over" ? "budgetOverAlert" : "budgetWarningAlert", {
                  category: categoryLabel(
                    categories.find((category) => category.id === alert.category_id),
                    (key) => names(key)
                  ),
                  percent: alert.percent,
                  spent: format.number(alert.spent_twd, moneyFormat("TWD")),
                  budget: format.number(alert.amount_twd, moneyFormat("TWD")),
                })}
              </span>
            </li>
          );
        })}
      </ul>
      <Link href="/finance/budgets" className="flex min-h-10 w-fit items-center underline underline-offset-4">
        {t("openBudgets")}
      </Link>
    </section>
  );
}
