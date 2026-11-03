import { CategoriesPage } from "@/features/finance/components/categories";
import { ensureFinanceReady } from "@/features/finance/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function CategoriesRoute() {
  const ctx = await getScheduleContext();
  await ensureFinanceReady(ctx);

  return <CategoriesPage categories={await ctx.repo.listFinCategories()} />;
}
