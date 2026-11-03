"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PRIMARY_NAV, SETTINGS_NAV, type NavItem } from "./nav-items";
import { RuneMark } from "./rune-mark";

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const t = useTranslations("nav");
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
        active
          ? "bg-crimson-950 text-bone-50 shadow-[inset_2px_0_0_var(--color-crimson-500)]"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      )}
    >
      <Icon className="size-4.5" aria-hidden="true" />
      {t(item.labelKey)}
    </Link>
  );
}

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r bg-sidebar p-3 md:flex">
      <div className="flex items-center gap-2 px-2 py-3">
        <RuneMark className="size-8 shrink-0" />
        <span className="font-heading text-sm leading-tight font-semibold">{t("app.name")}</span>
      </div>
      <nav aria-label={t("nav.label")} className="mt-3 flex flex-1 flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} />
        ))}
        <div className="mt-auto">
          <SidebarLink item={SETTINGS_NAV} pathname={pathname} />
        </div>
      </nav>
    </aside>
  );
}
