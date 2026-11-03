import { getTranslations } from "next-intl/server";
import { RecurringPage } from "@/features/finance/components/recurring";
import { ensureFinanceReady } from "@/features/finance/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function RecurringRoute() {
  const t = await getTranslations("finance");
  const ctx = await getScheduleContext();
  await ensureFinanceReady(ctx);
  const [rules, categories] = await Promise.all([ctx.repo.listRecurringRules(), ctx.repo.listFinCategories()]);

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("recurringFlavor")}</p>
      <RecurringPage rules={rules} categories={categories} today={ctx.today} />
    </>
  );
}
