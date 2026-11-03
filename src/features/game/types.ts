import type { InstanceStatus } from "@/features/schedule/types";

export type GameValues = {
  total_xp: number;
  power: number;
  tier: number;
  streak_days: number;
  power_zero_count: number;
  demotion_count: number;
  last_closed_date: string | null;
};

export type GameState = GameValues & { version: number; seen_level: number; seen_tier: number };

export type LedgerSource = "block" | "closeout" | "correction" | "collapse";

export type LedgerReason =
  | "block_done"
  | "block_partial"
  | "block_changed"
  | "block_removed"
  | "skipped"
  | "correction"
  | "collapse";

export type NewLedgerEntry = {
  date: string;
  source: LedgerSource;
  block_instance_id: string | null;
  block_title: string;
  reason: LedgerReason;
  delta_xp: number;
  delta_power: number;
  tier: number;
};

export type LedgerEntry = NewLedgerEntry & { id: string; created_at: string };

export type DayType = "normal" | "rest" | "shield" | "empty";

export type DailySummary = {
  date: string;
  day_type: DayType;
  planned_minutes: number;
  done_minutes: number;
  partial_minutes: number;
  skipped_minutes: number;
  blocks_skipped: number;
  xp_gained: number;
  xp_lost: number;
  power_change: number;
  /** null when the day was neutral: neither broke nor extended the streak. */
  counted: boolean | null;
  streak_before: number;
  streak_after: number;
  tier_before: number;
  tier_after: number;
  collapsed: boolean;
  demoted: boolean;
  seen_at: string | null;
};

export type InstanceChange = {
  id: string;
  status: InstanceStatus;
  log_note: string;
  logged_at: string | null;
};

export type AuditEntry = {
  actor: "owner" | "oracle" | "system";
  action: string;
  entity: string | null;
  details: Record<string, unknown>;
};

/** Everything one game change writes. It all lands together, or not at all. */
export type GameCommit = {
  expected_version: number;
  close_date: string | null;
  instances: InstanceChange[];
  ledger: NewLedgerEntry[];
  state: GameValues;
  summaries: DailySummary[];
  audit: AuditEntry[];
};

export type ClosedDay = { date: string; created_at: string };
