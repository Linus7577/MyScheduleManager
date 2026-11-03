import { getTranslations } from "next-intl/server";
import { BudgetBanner } from "@/features/finance/components/budget-alerts";
import { BudgetsPage } from "@/features/finance/components/budgets";
import { ensureFinanceReady, getBudgetsView, getSpendingSummary } from "@/features/finance/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function BudgetsRoute() {
  const t = await getTranslations("finance");
  const ctx = await getScheduleContext();
  await ensureFinanceReady(ctx);
  const [view, spending] = await Promise.all([getBudgetsView(ctx), getSpendingSummary(ctx)]);

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("budgetsFlavor")}</p>
      <BudgetBanner alerts={spending.alerts} categories={spending.categories} />
      <BudgetsPage categories={view.categories} statuses={view.statuses} />
    </>
  );
}
