import type { AuditEntry } from "@/features/game/types";
import type {
  LoggedAudit,
  NewOracleAction,
  NewProposal,
  OracleAction,
  OracleMessage,
  Proposal,
  ProposalStatus,
  Suggestion,
} from "./types";

export interface OracleRepo {
  getLatestConversationId(): Promise<string | null>;
  createConversation(): Promise<string>;
  /** The most recent messages, oldest first. */
  listMessages(conversationId: string, limit: number): Promise<OracleMessage[]>;
  addMessage(conversationId: string, role: OracleMessage["role"], content: string): Promise<void>;

  createProposal(proposal: NewProposal): Promise<Proposal>;
  getProposal(id: string): Promise<Proposal | null>;
  listProposals(conversationId: string): Promise<Proposal[]>;
  updateProposal(id: string, patch: { status: ProposalStatus; decided_at: string | null; changes?: unknown }): Promise<void>;

  createAction(action: NewOracleAction): Promise<OracleAction>;
  getAction(id: string): Promise<OracleAction | null>;
  listActions(conversationId: string): Promise<OracleAction[]>;
  markActionUndone(id: string, at: string): Promise<void>;

  /** Counts a request, and returns whether it's within the limit for this minute. */
  bumpRateLimit(maxPerMinute: number, now: Date): Promise<boolean>;

  getSuggestion(date: string): Promise<Suggestion | null>;
  saveSuggestion(suggestion: Suggestion): Promise<void>;

  getWeeklyReview(weekStart: string): Promise<string | null>;
  saveWeeklyReview(weekStart: string, text: string | null): Promise<void>;

  addAudit(entry: AuditEntry): Promise<void>;
  listAudit(limit: number): Promise<LoggedAudit[]>;

  getAboutMe(): Promise<string>;
  setAboutMe(text: string): Promise<void>;
}
