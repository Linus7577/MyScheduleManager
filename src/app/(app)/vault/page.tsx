import { getTranslations } from "next-intl/server";
import { VaultPage } from "@/features/vault/components/vault-page";
import { ensureVaultReady, getVaultView } from "@/features/vault/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function VaultRoute() {
  const t = await getTranslations("vault");
  const ctx = await getScheduleContext();
  await ensureVaultReady(ctx);
  const { sections, items, goals, projects, tracks } = await getVaultView(ctx);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("flavor")}</p>
      <VaultPage sections={sections} items={items} options={{ goals, projects, tracks }} />
    </div>
  );
}
