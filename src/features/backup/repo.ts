import type { Backup, BackupRow, BackupTable } from "./logic";

export interface BackupRepo {
  /** One page of a table's rows, always in the same order, so that pages never overlap. */
  readBackupRows(table: BackupTable, from: number, to: number): Promise<BackupRow[]>;
  /** Replaces everything with what's in the backup. It all lands together, or nothing changes. */
  restoreBackup(backup: Backup): Promise<void>;
}
