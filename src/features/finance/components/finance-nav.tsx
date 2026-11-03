"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/finance", key: "navOverview" },
  { href: "/finance/portfolio", key: "navPortfolio" },
  { href: "/finance/budgets", key: "navBudgets" },
  { href: "/finance/recurring", key: "navRecurring" },
  { href: "/finance/categories", key: "navCategories" },
] as const;

export function FinanceNav() {
  const t = useTranslations("finance");
  const pathname = usePathname();

  return (
    <nav aria-label={t("navLabel")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {LINKS.map((link) => {
        const current = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex h-10 shrink-0 items-center rounded-lg px-3 text-sm",
              current ? "bg-surface-2 text-foreground ring-1 ring-foreground/20" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}
