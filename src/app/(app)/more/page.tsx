import Link from "next/link";
import { ChevronRight, Lock, ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SETTINGS_NAV } from "@/components/shell/nav-items";
import { Card, CardContent } from "@/components/ui/card";

const SEALED_HALLS = [
  { labelKey: "goals", phase: 3 },
  { labelKey: "learning", phase: 3 },
  { labelKey: "habits", phase: 3 },
  { labelKey: "finance", phase: 5 },
  { labelKey: "vault", phase: 6 },
  { labelKey: "review", phase: 7 },
] as const;

export default async function MorePage() {
  const t = await getTranslations("more");
  const nav = await getTranslations("nav");
  const SettingsIcon = SETTINGS_NAV.icon;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("flavor")}</p>

      <Link
        href="/battle-log"
        className="glow-card flex h-14 items-center gap-3 rounded-xl bg-card px-4 text-sm ring-1 ring-foreground/10"
      >
        <ScrollText className="size-5 text-crimson-400" aria-hidden="true" />
        {t("battleLog")}
        <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      </Link>

      <Link
        href={SETTINGS_NAV.href}
        className="glow-card flex h-14 items-center gap-3 rounded-xl bg-card px-4 text-sm ring-1 ring-foreground/10"
      >
        <SettingsIcon className="size-5 text-crimson-400" aria-hidden="true" />
        {nav("settings")}
        <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      </Link>

      <Card>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {SEALED_HALLS.map((hall) => (
              <li key={hall.labelKey} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                <span>{t(hall.labelKey)}</span>
                <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden="true" />
                  {t("locked", { phase: hall.phase })}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
