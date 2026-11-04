import { getTranslations } from "next-intl/server";
import type { VaultItem } from "../types";
import { ITEM_ICONS, itemIconKey } from "./item-meta";
import { ItemTitle } from "./vault-page";

/** The Vault items attached to a goal or learning track, shown on its page. Nothing shows when there are none. */
export async function LinkedItems({ items }: { items: VaultItem[] }) {
  const t = await getTranslations("vault");
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="text-base font-semibold">{t("fromTheVault")}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const Icon = ITEM_ICONS[itemIconKey(item)];
          return (
            <li key={item.id} className="flex items-start gap-2">
              <Icon className="mt-0.5 size-4 shrink-0 text-crimson-400" aria-label={t(`types.${item.type}`)} />
              <ItemTitle item={item} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
