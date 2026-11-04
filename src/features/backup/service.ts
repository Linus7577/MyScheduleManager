import type { ScheduleContext } from "@/features/schedule/generation";
import type { ScheduleErrorCode } from "@/features/schedule/types";
import { BACKUP_APP, BACKUP_TABLES, BACKUP_VERSION, countRows, readBackup, type BackupRow, type BackupTable } from "./logic";
import type { BackupRepo } from "./repo";

/** The database hands back this many rows at a time, however many are asked for. */
const PAGE_SIZE = 1000;

export async function readAllRows(repo: BackupRepo, table: BackupTable): Promise<BackupRow[]> {
  const rows: BackupRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await repo.readBackupRows(table, from, from + PAGE_SIZE - 1);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/**
 * Writes the backup a piece at a time, because the host limits a finished response to 4.5 MB but not one sent as it's made.
 * The owner's account id is left out: restoring fills in whoever is signed in.
 */
export async function* backupChunks(repo: BackupRepo, exportedAt: string): AsyncGenerator<string> {
  yield `{"app":${JSON.stringify(BACKUP_APP)},"version":${BACKUP_VERSION},"exported_at":${JSON.stringify(exportedAt)},"tables":{`;
  for (const [tableIndex, table] of BACKUP_TABLES.entries()) {
    yield `${tableIndex === 0 ? "" : ","}${JSON.stringify(table)}:[`;
    let wroteRow = false;
    for (let from = 0; ; from += PAGE_SIZE) {
      const page = await repo.readBackupRows(table, from, from + PAGE_SIZE - 1);
      if (page.length > 0) {
        const text = page
          .map((row) => {
            const copy = { ...row };
            delete copy.user_id;
            return JSON.stringify(copy);
          })
          .join(",");
        yield `${wroteRow ? "," : ""}${text}`;
        wroteRow = true;
      }
      if (page.length < PAGE_SIZE) break;
    }
    yield "]";
  }
  yield "}}";
}

export type RestoreResult = { ok: true; rows: number } | { ok: false; code: ScheduleErrorCode };

/** Takes the file's text. A file that isn't a backup, or doesn't fit the database's rules, changes nothing. */
export async function restoreFromText(ctx: ScheduleContext, text: string): Promise<RestoreResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "badBackupFile" };
  }
  const backup = readBackup(parsed);
  if (!backup) return { ok: false, code: "badBackupFile" };

  try {
    await ctx.repo.restoreBackup(backup);
  } catch {
    return { ok: false, code: "restoreFailed" };
  }
  const rows = countRows(backup);
  await ctx.repo.addAudit({
    actor: "owner",
    action: "restore_backup",
    entity: null,
    details: { rows, exported_at: backup.exported_at },
  });
  return { ok: true, rows };
}
