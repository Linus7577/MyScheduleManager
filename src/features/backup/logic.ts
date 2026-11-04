/**
 * Every table with the owner's data, in the order they can be put back: anything another table points at comes first.
 * Left out on purpose: devices that receive notifications, the record of what's been sent, and the Oracle's rate limit.
 * They belong to this device and this moment, not to the owner's history. The list in restore_backup must match.
 */
export const BACKUP_TABLES = [
  "settings",
  "audit_log",
  "loop_templates",
  "template_activations",
  "learning_tracks",
  "template_blocks",
  "events",
  "block_instances",
  "rest_days",
  "game_state",
  "game_ledger",
  "closed_days",
  "daily_summaries",
  "goals",
  "projects",
  "learning_units",
  "tasks",
  "progress_snapshots",
  "habits",
  "habit_checkins",
  "widget_layouts",
  "ai_conversations",
  "ai_messages",
  "ai_proposals",
  "ai_actions",
  "ai_suggestions",
  "weekly_reviews",
  "fin_categories",
  "recurring_rules",
  "transactions",
  "budgets",
  "trades",
  "price_cache",
  "fx_rates",
  "portfolio_snapshots",
  "vault_sections",
  "vault_items",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, unknown>;

export const BACKUP_APP = "my-schedule-manager";
export const BACKUP_VERSION = 1;
/** How much a restore can read once unpacked. Years of use fit well inside this. */
export const MAX_BACKUP_BYTES = 64_000_000;
/** The most a free hosting plan accepts in one request. Backups are compressed in the browser to stay under it. */
export const MAX_UPLOAD_BYTES = 4_400_000;

export type Backup = {
  app: typeof BACKUP_APP;
  version: number;
  exported_at: string;
  tables: Partial<Record<BackupTable, BackupRow[]>>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The shape only. What's inside each row is checked by the database, which puts everything back or nothing. */
export function readBackup(value: unknown): Backup | null {
  if (!isObject(value) || value.app !== BACKUP_APP) return null;
  if (typeof value.version !== "number" || !Number.isInteger(value.version)) return null;
  // A file from a newer version of the app may hold things this one would lose.
  if (value.version < 1 || value.version > BACKUP_VERSION) return null;
  if (typeof value.exported_at !== "string" || !isObject(value.tables)) return null;

  const known = new Set<string>(BACKUP_TABLES);
  for (const [table, rows] of Object.entries(value.tables)) {
    if (!known.has(table) || !Array.isArray(rows) || !rows.every(isObject)) return null;
  }
  return value as Backup;
}

export function countRows(backup: Backup): number {
  return Object.values(backup.tables).reduce((total, rows) => total + (rows?.length ?? 0), 0);
}

/** A cell starting with one of these runs as a formula when a spreadsheet opens the file. */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Numbers can be negative, and are never formulas.
  if (typeof value === "number") return String(value);
  const text = String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Starts with a marker that tells spreadsheet programs the text is UTF-8, so Chinese displays correctly. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function transactionsCsv(rows: BackupRow[], categories: BackupRow[]): string {
  const name = new Map(categories.map((category) => [category.id, category.name || category.key || ""]));
  return toCsv(
    ["date", "kind", "category", "amount", "currency", "fx_rate", "amount_twd", "payment_method", "note"],
    [...rows]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((row) => [
        row.date,
        row.kind,
        name.get(row.category_id) ?? "",
        Number(row.amount),
        row.currency,
        Number(row.fx_rate),
        Number(row.amount_twd),
        row.payment_method,
        row.note,
      ])
  );
}

export function tradesCsv(rows: BackupRow[]): string {
  return toCsv(
    ["date", "side", "market", "symbol", "quantity", "price", "fee", "currency", "fx_rate", "note"],
    [...rows]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((row) => [
        row.date,
        row.side,
        row.market,
        row.symbol,
        Number(row.quantity),
        Number(row.price),
        Number(row.fee),
        row.currency,
        Number(row.fx_rate),
        row.note,
      ])
  );
}
