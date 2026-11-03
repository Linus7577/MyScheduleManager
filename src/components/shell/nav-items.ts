import { CalendarDays, Eye, Home, Menu, Repeat, Settings, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  labelKey: "home" | "loop" | "calendar" | "oracle" | "more" | "settings";
  icon: LucideIcon;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", labelKey: "home", icon: Home },
  { href: "/loop", labelKey: "loop", icon: Repeat },
  { href: "/calendar", labelKey: "calendar", icon: CalendarDays },
  { href: "/oracle", labelKey: "oracle", icon: Eye },
  { href: "/more", labelKey: "more", icon: Menu },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", labelKey: "settings", icon: Settings };
