"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PRIMARY_NAV } from "./nav-items";
import { isActivePath } from "./sidebar";

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {PRIMARY_NAV.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-1 text-xs transition-colors",
              active ? "text-crimson-400" : "text-muted-foreground"
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
