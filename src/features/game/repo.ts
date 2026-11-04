import type { ClosedDay, DailySummary, GameCommit, GameState, LedgerEntry } from "./types";

export interface GameRepo {
  getGameState(): Promise<GameState | null>;
  /** Creates the starting row. Does nothing if one already exists. */
  createGameState(): Promise<void>;
  /**
   * Applies one change as a single unit. Returns false, changing nothing, if the day was already closed
   * or the game state moved on since it was read.
   */
  commitGame(commit: GameCommit): Promise<boolean>;
  setSeenProgress(level: number, tier: number): Promise<void>;

  listLedger(limit: number): Promise<LedgerEntry[]>;
  listLedgerForBlocks(blockIds: string[]): Promise<LedgerEntry[]>;
  listAllLedger(): Promise<LedgerEntry[]>;
  listLedgerBetween(from: string, to: string): Promise<LedgerEntry[]>;

  getClosedDay(date: string): Promise<ClosedDay | null>;
  earliestInstanceDate(): Promise<string | null>;

  getSummary(date: string): Promise<DailySummary | null>;
  listSummariesFrom(date: string): Promise<DailySummary[]>;
  latestSummary(): Promise<DailySummary | null>;
  listUnseenSummaries(): Promise<DailySummary[]>;
  markSummariesSeen(at: string): Promise<void>;
}
