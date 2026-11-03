import type { Category } from "@/config/game.config";
import type { AuditEntry } from "@/features/game/types";

export type OracleMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type BlockSnapshot = { start_time: string; end_time: string; title: string };

/** after: null means removing the block for that day. */
export type BlockChange = {
  instance_id: string;
  date: string;
  before: BlockSnapshot;
  after: BlockSnapshot | null;
};

export type TemplateBlockSpec = {
  weekday: number;
  start_time: string;
  end_time: string;
  category: Category;
  title: string;
  notes: string;
};

export type TemplateChange = {
  op: "add" | "update" | "remove";
  template_id: string;
  block_id: string | null;
  before: TemplateBlockSpec | null;
  after: TemplateBlockSpec | null;
};

export type ProposalStatus = "pending" | "approved" | "rejected" | "expired";

type ProposalBase = {
  conversation_id: string;
  summary: string;
  expires_at: string;
};

export type NewProposal = ProposalBase &
  ({ kind: "block_changes"; changes: BlockChange[] } | { kind: "template_changes"; changes: TemplateChange[] });

export type Proposal = NewProposal & {
  id: string;
  status: ProposalStatus;
  decided_at: string | null;
  created_at: string;
};

export type UndoPlan =
  | { kind: "delete_goal"; id: string }
  | { kind: "delete_project"; id: string }
  | { kind: "delete_task"; id: string }
  | { kind: "restore_project"; id: string; progress_mode: "tasks" | "manual"; manual_percent: number }
  | { kind: "restore_unit"; id: string; percent: number }
  | { kind: "restore_review"; week_start: string; text: string | null };

export type NewOracleAction = {
  conversation_id: string;
  tool: string;
  summary: string;
  undo: UndoPlan;
  undo_until: string;
};

export type OracleAction = NewOracleAction & { id: string; undone_at: string | null; created_at: string };

export type Suggestion = { date: string; text: string; generation_count: number };

export type LoggedAudit = AuditEntry & { id: string; created_at: string };
