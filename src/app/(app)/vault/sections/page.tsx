import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { SectionsPage } from "@/features/vault/components/sections";
import { ensureVaultReady } from "@/features/vault/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function VaultSectionsRoute() {
  const t = await getTranslations("vault");
  const ctx = await getScheduleContext();
  await ensureVaultReady(ctx);
  const [sections, items] = await Promise.all([ctx.repo.listVaultSections(), ctx.repo.listVaultItems()]);

  const counts: Record<string, number> = {};
  for (const item of items) counts[item.section_id] = (counts[item.section_id] ?? 0) + 1;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/vault" className="flex h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("title")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("sectionsTitle")}</h1>
      <SectionsPage sections={sections} counts={counts} />
    </div>
  );
}
