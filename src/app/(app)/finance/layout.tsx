import { getTranslations } from "next-intl/server";
import { FinanceNav } from "@/features/finance/components/finance-nav";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("finance");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <FinanceNav />
      {children}
    </div>
  );
}
