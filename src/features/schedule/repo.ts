import type {
  BlockFields,
  BlockInstance,
  CalendarEvent,
  EventFields,
  ImportedEvent,
  InstanceStatus,
  LoopTemplate,
  NewInstance,
  RestDay,
  RestKind,
  TemplateActivation,
  TemplateBlock,
} from "./types";

/**
 * Everything the schedule needs from storage. Supabase is the real one. The in-memory one lets the
 * rules be tested, and the screens be previewed, without a database or a login.
 */
export interface ScheduleRepo {
  /** Blocks and days the game has already closed are protected by the rules above this layer. */
  listTemplates(): Promise<LoopTemplate[]>;
  createTemplate(name: string): Promise<LoopTemplate>;
  renameTemplate(id: string, name: string): Promise<void>;
  deleteTemplate(id: string): Promise<void>;

  listActivations(): Promise<TemplateActivation[]>;
  upsertActivation(templateId: string, effectiveFrom: string): Promise<void>;

  listBlocks(): Promise<TemplateBlock[]>;
  getBlock(id: string): Promise<TemplateBlock | null>;
  createBlock(block: Omit<TemplateBlock, "id">): Promise<void>;
  updateBlock(id: string, patch: BlockFields & { weekday?: number }): Promise<void>;
  deleteBlock(id: string): Promise<void>;

  listInstances(from: string, to: string): Promise<BlockInstance[]>;
  getInstance(id: string): Promise<BlockInstance | null>;
  getInstanceByEvent(eventId: string): Promise<BlockInstance | null>;
  latestTemplateInstanceDate(): Promise<string | null>;
  /** Rows that already exist for the same template block and date are left alone. */
  insertInstances(rows: NewInstance[]): Promise<void>;
  updateInstance(id: string, patch: Partial<BlockInstance>): Promise<void>;
  deleteInstance(id: string): Promise<void>;
  /** Removes template blocks from this date on that the owner hasn't logged or edited. */
  deleteRegenerableInstances(fromDate: string): Promise<void>;
  setDayStatus(date: string, fromStatuses: InstanceStatus[], to: InstanceStatus): Promise<void>;

  listRestDays(from: string, to: string): Promise<RestDay[]>;
  addRestDay(date: string, kind: RestKind): Promise<void>;
  deleteRestDay(date: string): Promise<void>;

  /** Events that touch this range, including multi-day events that started before it, and every repeating event. */
  listEvents(from: string, to: string): Promise<CalendarEvent[]>;
  getEvent(id: string): Promise<CalendarEvent | null>;
  createEvent(event: EventFields): Promise<CalendarEvent>;
  updateEvent(id: string, event: Partial<EventFields> & { exdates?: string[] }): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  /** Adds events from a calendar file in one go. */
  importEvents(events: ImportedEvent[]): Promise<void>;
  /** Everything in every event, for exporting. */
  listAllEvents(): Promise<CalendarEvent[]>;
  /** Titles and notes containing this text, ignoring case. */
  searchEvents(query: string, limit: number): Promise<CalendarEvent[]>;
  /** Blocks whose title contains this text, newest first. */
  searchInstances(query: string, limit: number): Promise<BlockInstance[]>;
}
