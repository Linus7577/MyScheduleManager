import Link from "next/link";
import { ChevronRight, GraduationCap, Lock, ScrollText, Settings, Target, Timer, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";

const SEALED_HALLS = [
  { labelKey: "finance", phase: 5 },
  { labelKey: "vault", phase: 6 },
  { labelKey: "review", phase: 7 },
] as const;

function HallLink(props: { href: string; icon: LucideIcon; label: string }) {
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      className="glow-card flex h-14 items-center gap-3 rounded-xl bg-card px-4 text-sm ring-1 ring-foreground/10"
    >
      <Icon className="size-5 text-crimson-400" aria-hidden="true" />
      {props.label}
      <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export default async function MorePage() {
  const t = await getTranslations("more");
  const nav = await getTranslations("nav");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("flavor")}</p>

      <HallLink href="/goals" icon={Target} label={t("goals")} />
      <HallLink href="/learning" icon={GraduationCap} label={t("learning")} />
      <HallLink href="/habits" icon={Timer} label={t("habits")} />
      <HallLink href="/battle-log" icon={ScrollText} label={t("battleLog")} />
      <HallLink href="/settings" icon={Settings} label={nav("settings")} />

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
