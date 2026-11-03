import type {
  DashboardDevice,
  Goal,
  Habit,
  HabitCheckin,
  LearningTrack,
  LearningUnit,
  ProgressSnapshot,
  Project,
  Task,
  WidgetSetting,
} from "@/features/command/types";
import type { AuditEntry, ClosedDay, DailySummary, GameState, LedgerEntry } from "@/features/game/types";
import type { AppRepo } from "./generation";
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
  game: GameState | null;
  ledger: LedgerEntry[];
  closedDays: ClosedDay[];
  summaries: DailySummary[];
  audit: AuditEntry[];
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  tracks: LearningTrack[];
  units: LearningUnit[];
  snapshots: ProgressSnapshot[];
  habits: Habit[];
  checkins: HabitCheckin[];
  layouts: Partial<Record<DashboardDevice, WidgetSetting[]>>;
};

const emptyStore = (): Store => ({
  templates: [],
  activations: [],
  blocks: [],
  instances: [],
  restDays: [],
  events: [],
  game: null,
  ledger: [],
  closedDays: [],
  summaries: [],
  audit: [],
  goals: [],
  projects: [],
  tasks: [],
  tracks: [],
  units: [],
  snapshots: [],
  habits: [],
  checkins: [],
  layouts: {},
});

const newId = () => crypto.randomUUID();

/** Stands in for Supabase in tests and login-free preview. Nothing here is ever saved. */
export function createMemoryRepo(store: Store = emptyStore()): AppRepo {
  return {
    async listGoals() {
      return [...store.goals];
    },
    async createGoal(fields) {
      const goal = { ...fields, id: newId(), created_at: new Date().toISOString() };
      store.goals.push(goal);
      return goal;
    },
    async updateGoal(id, fields) {
      store.goals = store.goals.map((goal) => (goal.id === id ? { ...goal, ...fields } : goal));
    },
    async deleteGoal(id) {
      const projectIds = store.projects.filter((project) => project.goal_id === id).map((project) => project.id);
      store.goals = store.goals.filter((goal) => goal.id !== id);
      store.projects = store.projects.filter((project) => project.goal_id !== id);
      store.tasks = store.tasks.filter((task) => !projectIds.includes(task.project_id));
    },

    async listProjects() {
      return [...store.projects];
    },
    async createProject(fields) {
      store.projects.push({ ...fields, id: newId() });
    },
    async updateProject(id, fields) {
      store.projects = store.projects.map((project) => (project.id === id ? { ...project, ...fields } : project));
    },
    async deleteProject(id) {
      store.projects = store.projects.filter((project) => project.id !== id);
      store.tasks = store.tasks.filter((task) => task.project_id !== id);
    },

    async listTasks() {
      return [...store.tasks];
    },
    async listTasksDue(from, to) {
      return store.tasks.filter((task) => task.due_date && task.due_date >= from && task.due_date <= to);
    },
    async createTask(fields) {
      store.tasks.push({ ...fields, id: newId() });
    },
    async updateTask(id, fields) {
      store.tasks = store.tasks.map((task) => (task.id === id ? { ...task, ...fields } : task));
    },
    async deleteTask(id) {
      store.tasks = store.tasks.filter((task) => task.id !== id);
    },

    async listTracks() {
      return [...store.tracks];
    },
    async createTrack(fields) {
      const track = { ...fields, id: newId(), created_at: new Date().toISOString() };
      store.tracks.push(track);
      return track;
    },
    async updateTrack(id, fields) {
      store.tracks = store.tracks.map((track) => (track.id === id ? { ...track, ...fields } : track));
    },
    async deleteTrack(id) {
      store.tracks = store.tracks.filter((track) => track.id !== id);
      store.units = store.units.filter((unit) => unit.track_id !== id);
      store.tasks = store.tasks.map((task) => (task.track_id === id ? { ...task, track_id: null } : task));
      store.blocks = store.blocks.map((block) => (block.track_id === id ? { ...block, track_id: null } : block));
      store.instances = store.instances.map((block) => (block.track_id === id ? { ...block, track_id: null } : block));
    },

    async listUnits() {
      return [...store.units];
    },
    async createUnit(fields) {
      store.units.push({ ...fields, id: newId() });
    },
    async updateUnit(id, fields) {
      store.units = store.units.map((unit) => (unit.id === id ? { ...unit, ...fields } : unit));
    },
    async deleteUnit(id) {
      store.units = store.units.filter((unit) => unit.id !== id);
    },

    async upsertSnapshots(snapshots) {
      for (const snapshot of snapshots) {
        store.snapshots = store.snapshots.filter(
          (existing) =>
            !(
              existing.date === snapshot.date &&
              existing.entity_type === snapshot.entity_type &&
              existing.entity_id === snapshot.entity_id
            )
        );
        store.snapshots.push(snapshot);
      }
    },
    async listSnapshots(entityType, entityIds) {
      return store.snapshots.filter(
        (snapshot) => snapshot.entity_type === entityType && entityIds.includes(snapshot.entity_id)
      );
    },

    async listHabits() {
      return [...store.habits];
    },
    async createHabit(fields) {
      store.habits.push({ ...fields, id: newId(), created_at: new Date().toISOString() });
    },
    async updateHabit(id, fields) {
      store.habits = store.habits.map((habit) => (habit.id === id ? { ...habit, ...fields } : habit));
    },
    async deleteHabit(id) {
      store.habits = store.habits.filter((habit) => habit.id !== id);
      store.checkins = store.checkins.filter((checkin) => checkin.habit_id !== id);
    },

    async listCheckins(from, to) {
      return store.checkins.filter((checkin) => checkin.date >= from && checkin.date <= to);
    },
    async addCheckin(habitId, date) {
      store.checkins.push({ habit_id: habitId, date });
    },
    async removeCheckin(habitId, date) {
      store.checkins = store.checkins.filter((checkin) => !(checkin.habit_id === habitId && checkin.date === date));
    },

    async getWidgetLayout(device) {
      return store.layouts[device] ?? null;
    },
    async saveWidgetLayout(device, layout) {
      store.layouts[device] = layout;
    },

    async getGameState() {
      return store.game;
    },
    async createGameState() {
      store.game ??= {
        total_xp: 0,
        power: 100,
        tier: 1,
        streak_days: 0,
        power_zero_count: 0,
        demotion_count: 0,
        last_closed_date: null,
        version: 0,
        seen_level: 1,
        seen_tier: 1,
      };
    },
    async commitGame(commit) {
      if (!store.game || store.game.version !== commit.expected_version) return false;
      if (commit.close_date) {
        if (store.closedDays.some((day) => day.date === commit.close_date)) return false;
        store.closedDays.push({ date: commit.close_date, created_at: new Date().toISOString() });
      }
      store.game = { ...store.game, ...commit.state, version: store.game.version + 1 };
      for (const change of commit.instances) {
        store.instances = store.instances.map((i) => (i.id === change.id ? { ...i, ...change } : i));
      }
      for (const entry of commit.ledger) {
        store.ledger.push({ ...entry, id: newId(), created_at: new Date().toISOString() });
      }
      for (const summary of commit.summaries) {
        const existing = store.summaries.find((day) => day.date === summary.date);
        if (existing) {
          store.summaries = store.summaries.map((day) =>
            day.date === summary.date ? { ...summary, seen_at: day.seen_at } : day
          );
        } else {
          store.summaries.push(summary);
        }
      }
      store.audit.push(...commit.audit);
      return true;
    },
    async setSeenProgress(level, tier) {
      if (store.game) store.game = { ...store.game, seen_level: level, seen_tier: tier };
    },

    async listLedger(limit) {
      return [...store.ledger].reverse().slice(0, limit);
    },
    async listLedgerForBlocks(blockIds) {
      return store.ledger.filter((entry) => entry.block_instance_id && blockIds.includes(entry.block_instance_id));
    },
    async listAllLedger() {
      return [...store.ledger];
    },

    async getClosedDay(date) {
      return store.closedDays.find((day) => day.date === date) ?? null;
    },
    async earliestInstanceDate() {
      const dates = store.instances.map((i) => i.date).sort();
      return dates[0] ?? null;
    },

    async getSummary(date) {
      return store.summaries.find((day) => day.date === date) ?? null;
    },
    async listSummariesFrom(date) {
      return store.summaries.filter((day) => day.date >= date).sort((a, b) => a.date.localeCompare(b.date));
    },
    async latestSummary() {
      return [...store.summaries].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
    },
    async listUnseenSummaries() {
      return store.summaries.filter((day) => !day.seen_at).sort((a, b) => a.date.localeCompare(b.date));
    },
    async markSummariesSeen(at) {
      store.summaries = store.summaries.map((day) => (day.seen_at ? day : { ...day, seen_at: at }));
    },

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
          track_id: row.track_id ?? null,
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

export function resetPreviewStore(): void {
  shared.previewScheduleStore = emptyStore();
}

/** One store per dev server, shared across requests, so preview behaves like a real database. */
export function getPreviewRepo(): AppRepo {
  shared.previewScheduleStore ??= emptyStore();
  return createMemoryRepo(shared.previewScheduleStore);
}
