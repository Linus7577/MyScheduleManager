import type { Category } from "@/config/game.config";

export type InstanceStatus = "planned" | "done" | "partial" | "skipped" | "rest";
export type LogStatus = "done" | "partial" | "skipped";
export type RestKind = "rest" | "shield";

export type LoopTemplate = { id: string; name: string; created_at: string };

export type TemplateActivation = { id: string; template_id: string; effective_from: string };

export type BlockFields = {
  start_time: string;
  end_time: string;
  category: Category;
  title: string;
  notes: string;
};

export type TemplateBlock = BlockFields & { id: string; template_id: string; weekday: number };

export type BlockInstance = BlockFields & {
  id: string;
  date: string;
  status: InstanceStatus;
  log_note: string;
  logged_at: string | null;
  template_block_id: string | null;
  event_id: string | null;
  is_edited: boolean;
  is_cancelled: boolean;
  focus_broken_count: number;
};

export type NewInstance = BlockFields & {
  date: string;
  status: InstanceStatus;
  template_block_id: string | null;
  event_id: string | null;
};

export type RestDay = { id: string; date: string; kind: RestKind };

export type EventFields = {
  title: string;
  notes: string;
  category: Category;
  all_day: boolean;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
};

export type CalendarEvent = EventFields & { id: string };

export type ScheduleErrorCode =
  | "invalid"
  | "failed"
  | "notFound"
  | "futureBlock"
  | "notLoggable"
  | "restMustBeFuture"
  | "restLimit"
  | "shieldInPast"
  | "shieldLimit"
  | "dayAlreadyDeclared"
  | "cannotUndo"
  | "templateInUse"
  | "effectiveInPast"
  | "eventProductiveTimed"
  | "eventEndBeforeStart"
  | "eventLinked"
  | "notCancellable"
  | "dayClosed"
  | "correctionExpired"
  | "correctionNeedsStatus";

export type ActionResult = { ok: true } | { ok: false; code: ScheduleErrorCode };

/** One item in the calendar feed. The client turns these into calendar entries. */
export type FeedItem = {
  id: string;
  kind: "block" | "event";
  title: string;
  category: Category;
  status: InstanceStatus | null;
  all_day: boolean;
  start: string;
  end: string;
  date: string;
  event: CalendarEvent | null;
};
