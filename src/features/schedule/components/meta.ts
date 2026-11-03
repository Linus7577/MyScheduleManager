import { Circle, CircleCheck, CircleDotDashed, CircleX, Moon, type LucideIcon } from "lucide-react";
import type { Category } from "@/config/game.config";
import type { InstanceStatus } from "../types";

/** Status always shows an icon as well as a colour, so it never relies on colour alone. */
export const STATUS_META: Record<InstanceStatus, { icon: LucideIcon; colorClass: string }> = {
  planned: { icon: Circle, colorClass: "text-ash-300" },
  done: { icon: CircleCheck, colorClass: "text-ember-400" },
  partial: { icon: CircleDotDashed, colorClass: "text-bone-300" },
  skipped: { icon: CircleX, colorClass: "text-crimson-400" },
  rest: { icon: Moon, colorClass: "text-ash-300" },
};

export const CATEGORY_COLOR: Record<Category, string> = {
  project_work: "var(--color-crimson-400)",
  study: "var(--color-ember-400)",
  gym: "var(--color-ember-200)",
  reading: "var(--color-crimson-200)",
  useful_youtube: "var(--color-bone-400)",
  other: "var(--color-ash-500)",
};

export const FIELD_CLASS =
  "h-11 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
