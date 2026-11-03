import type { ScheduleRepo } from "./repo";
import type {
  BlockInstance,
  CalendarEvent,
  LoopTemplate,
  RestDay,
  TemplateActivation,
  TemplateBlock,
} from "./types";

type Store = {
  templates: LoopTemplate[];
  activations: TemplateActivation[];
  blocks: TemplateBlock[];
  instances: BlockInstance[];
  restDays: RestDay[];
  events: CalendarEvent[];
};

const emptyStore = (): Store => ({
  templates: [],
  activations: [],
  blocks: [],
  instances: [],
  restDays: [],
  events: [],
});

const newId = () => crypto.randomUUID();

/** Stands in for Supabase in tests and login-free preview. Nothing here is ever saved. */
export function createMemoryRepo(store: Store = emptyStore()): ScheduleRepo {
  return {
    async listTemplates() {
      return [...store.templates];
    },
    async createTemplate(name) {
      const template = { id: newId(), name, created_at: new Date().toISOString() };
      store.templates.push(template);
      return template;
    },
    async renameTemplate(id, name) {
      store.templates = store.templates.map((t) => (t.id === id ? { ...t, name } : t));
    },
    async deleteTemplate(id) {
      const blockIds = new Set(store.blocks.filter((b) => b.template_id === id).map((b) => b.id));
      store.templates = store.templates.filter((t) => t.id !== id);
      store.activations = store.activations.filter((a) => a.template_id !== id);
      store.blocks = store.blocks.filter((b) => b.template_id !== id);
      store.instances = store.instances.map((i) =>
        i.template_block_id && blockIds.has(i.template_block_id) ? { ...i, template_block_id: null } : i
      );
    },

    async listActivations() {
      return [...store.activations];
    },
    async upsertActivation(templateId, effectiveFrom) {
      store.activations = store.activations.filter((a) => a.effective_from !== effectiveFrom);
      store.activations.push({ id: newId(), template_id: templateId, effective_from: effectiveFrom });
    },

    async listBlocks() {
      return [...store.blocks];
    },
    async getBlock(id) {
      return store.blocks.find((b) => b.id === id) ?? null;
    },
    async createBlock(block) {
      store.blocks.push({ ...block, id: newId() });
    },
    async updateBlock(id, patch) {
      store.blocks = store.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    },
    async deleteBlock(id) {
      store.blocks = store.blocks.filter((b) => b.id !== id);
      store.instances = store.instances.map((i) =>
        i.template_block_id === id ? { ...i, template_block_id: null } : i
      );
    },

    async listInstances(from, to) {
      return store.instances
        .filter((i) => i.date >= from && i.date <= to)
        .sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`));
    },
    async getInstance(id) {
      return store.instances.find((i) => i.id === id) ?? null;
    },
    async getInstanceByEvent(eventId) {
      return store.instances.find((i) => i.event_id === eventId) ?? null;
    },
    async latestTemplateInstanceDate() {
      const dates = store.instances.filter((i) => i.template_block_id).map((i) => i.date);
      return dates.length ? dates.sort().at(-1)! : null;
    },
    async insertInstances(rows) {
      for (const row of rows) {
        const exists = store.instances.some(
          (i) =>
            (row.template_block_id && i.template_block_id === row.template_block_id && i.date === row.date) ||
            (row.event_id && i.event_id === row.event_id)
        );
        if (exists) continue;
        store.instances.push({
          ...row,
          id: newId(),
          log_note: "",
          logged_at: null,
          is_edited: false,
          is_cancelled: false,
          focus_broken_count: 0,
        });
      }
    },
    async updateInstance(id, patch) {
      store.instances = store.instances.map((i) => (i.id === id ? { ...i, ...patch } : i));
    },
    async deleteInstance(id) {
      store.instances = store.instances.filter((i) => i.id !== id);
    },
    async deleteRegenerableInstances(fromDate) {
      store.instances = store.instances.filter(
        (i) =>
          !(
            i.date >= fromDate &&
            i.template_block_id &&
            !i.is_edited &&
            (i.status === "planned" || i.status === "rest")
          )
      );
    },
    async setDayStatus(date, fromStatuses, to) {
      store.instances = store.instances.map((i) =>
        i.date === date && fromStatuses.includes(i.status) ? { ...i, status: to } : i
      );
    },

    async listRestDays(from, to) {
      return store.restDays.filter((d) => d.date >= from && d.date <= to);
    },
    async addRestDay(date, kind) {
      store.restDays.push({ id: newId(), date, kind });
    },
    async deleteRestDay(date) {
      store.restDays = store.restDays.filter((d) => d.date !== date);
    },

    async listEvents(from, to) {
      return store.events.filter((e) => e.start_date <= to && e.end_date >= from);
    },
    async getEvent(id) {
      return store.events.find((e) => e.id === id) ?? null;
    },
    async createEvent(event) {
      const created = { ...event, id: newId() };
      store.events.push(created);
      return created;
    },
    async updateEvent(id, event) {
      store.events = store.events.map((e) => (e.id === id ? { ...e, ...event } : e));
    },
    async deleteEvent(id) {
      store.events = store.events.filter((e) => e.id !== id);
      store.instances = store.instances.filter((i) => i.event_id !== id);
    },
  };
}

const shared = globalThis as unknown as { previewScheduleStore?: Store };

/** One store per dev server, shared across requests, so preview behaves like a real database. */
export function getPreviewRepo(): ScheduleRepo {
  shared.previewScheduleStore ??= emptyStore();
  return createMemoryRepo(shared.previewScheduleStore);
}
