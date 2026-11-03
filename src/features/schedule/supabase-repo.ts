import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WidgetSetting } from "@/features/command/types";
import type { DailySummary, GameState, LedgerEntry } from "@/features/game/types";
import type { OracleAction, OracleMessage, Proposal } from "@/features/oracle/types";
import type { AppRepo } from "./generation";
import type { BlockInstance, CalendarEvent, TemplateBlock } from "./types";

function unwrapMaybe<T>(result: { data: T | null; error: unknown }): T | null {
  if (result.error) throw new Error("Schedule database request failed");
  return result.data;
}

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  const data = unwrapMaybe(result);
  if (data === null) throw new Error("Schedule database request returned nothing");
  return data;
}

function check(result: { error: unknown }): void {
  if (result.error) throw new Error("Schedule database request failed");
}

// Postgres returns times as HH:MM:SS. The app works in HH:MM.
const shortTime = (time: string) => time.slice(0, 5);

const toBlock = (row: TemplateBlock): TemplateBlock => ({
  ...row,
  start_time: shortTime(row.start_time),
  end_time: shortTime(row.end_time),
});

const toInstance = (row: BlockInstance): BlockInstance => ({
  ...row,
  start_time: shortTime(row.start_time),
  end_time: shortTime(row.end_time),
});

const toEvent = (row: CalendarEvent): CalendarEvent => ({
  ...row,
  start_time: row.start_time && shortTime(row.start_time),
  end_time: row.end_time && shortTime(row.end_time),
});

// Postgres sends numeric values as strings or numbers depending on size, so Power is always converted.
const toGameState = (row: GameState): GameState => ({ ...row, power: Number(row.power) });
const toLedgerEntry = (row: LedgerEntry): LedgerEntry => ({ ...row, delta_power: Number(row.delta_power) });
const toSummary = (row: DailySummary): DailySummary => ({ ...row, power_change: Number(row.power_change) });

const SUMMARY_COLUMNS =
  "date, day_type, planned_minutes, done_minutes, partial_minutes, skipped_minutes, blocks_skipped, xp_gained, " +
  "xp_lost, power_change, counted, streak_before, streak_after, tier_before, tier_after, collapsed, demoted, seen_at";
const LEDGER_COLUMNS =
  "id, date, source, block_instance_id, block_title, reason, delta_xp, delta_power, tier, created_at";
const PROPOSAL_COLUMNS =
  "id, conversation_id, kind, summary, changes, status, expires_at, decided_at, created_at";
const ACTION_COLUMNS = "id, conversation_id, tool, summary, undo, undo_until, undone_at, created_at";
const STATE_COLUMNS =
  "total_xp, power, tier, streak_days, power_zero_count, demotion_count, last_closed_date, version, seen_level, seen_tier";

/**
 * Every query normally runs as the signed-in owner, so RLS still applies underneath this code.
 * The daily cron passes a server-only client with no session, and uses the same queries for the one owner.
 */
export function createSupabaseRepo(db: SupabaseClient, userId: string): AppRepo {
  return {
    async getLatestConversationId() {
      const row = unwrapMaybe(
        await db.from("ai_conversations").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle()
      );
      return (row as { id: string } | null)?.id ?? null;
    },
    async createConversation() {
      const row = unwrap(await db.from("ai_conversations").insert({ user_id: userId }).select("id").single());
      return (row as unknown as { id: string }).id;
    },
    async listMessages(conversationId, limit) {
      const rows = unwrap(
        await db
          .from("ai_messages")
          .select("id, conversation_id, role, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(limit)
      ) as OracleMessage[];
      return rows.reverse();
    },
    async addMessage(conversationId, role, content) {
      check(await db.from("ai_messages").insert({ user_id: userId, conversation_id: conversationId, role, content }));
    },

    async createProposal(proposal) {
      return unwrap(
        await db
          .from("ai_proposals")
          .insert({ ...proposal, user_id: userId })
          .select(PROPOSAL_COLUMNS)
          .single()
      ) as unknown as Proposal;
    },
    async getProposal(id) {
      return unwrapMaybe(await db.from("ai_proposals").select(PROPOSAL_COLUMNS).eq("id", id).maybeSingle()) as Proposal | null;
    },
    async listProposals(conversationId) {
      return unwrap(
        await db.from("ai_proposals").select(PROPOSAL_COLUMNS).eq("conversation_id", conversationId).order("created_at")
      ) as unknown as Proposal[];
    },
    async updateProposal(id, patch) {
      check(await db.from("ai_proposals").update(patch).eq("id", id));
    },

    async createAction(action) {
      return unwrap(
        await db
          .from("ai_actions")
          .insert({ ...action, user_id: userId })
          .select(ACTION_COLUMNS)
          .single()
      ) as unknown as OracleAction;
    },
    async getAction(id) {
      return unwrapMaybe(await db.from("ai_actions").select(ACTION_COLUMNS).eq("id", id).maybeSingle()) as OracleAction | null;
    },
    async listActions(conversationId) {
      return unwrap(
        await db.from("ai_actions").select(ACTION_COLUMNS).eq("conversation_id", conversationId).order("created_at")
      ) as unknown as OracleAction[];
    },
    async markActionUndone(id, at) {
      check(await db.from("ai_actions").update({ undone_at: at }).eq("id", id));
    },

    async bumpRateLimit(maxPerMinute) {
      const result = await db.rpc("bump_ai_rate_limit", { owner_id: userId, max_per_minute: maxPerMinute });
      if (result.error) throw new Error("Rate limit check failed");
      return result.data === true;
    },

    async getSuggestion(date) {
      return unwrapMaybe(
        await db.from("ai_suggestions").select("date, text, generation_count").eq("date", date).maybeSingle()
      );
    },
    async saveSuggestion(suggestion) {
      check(await db.from("ai_suggestions").upsert({ ...suggestion, user_id: userId }, { onConflict: "user_id,date" }));
    },

    async getWeeklyReview(weekStart) {
      const row = unwrapMaybe(
        await db.from("weekly_reviews").select("oracle_text").eq("week_start", weekStart).maybeSingle()
      );
      return (row as { oracle_text: string | null } | null)?.oracle_text ?? null;
    },
    async saveWeeklyReview(weekStart, text) {
      check(
        await db
          .from("weekly_reviews")
          .upsert({ user_id: userId, week_start: weekStart, oracle_text: text }, { onConflict: "user_id,week_start" })
      );
    },

    async addAudit(entry) {
      check(await db.from("audit_log").insert({ ...entry, user_id: userId }));
    },
    async listAudit(limit) {
      return unwrap(
        await db
          .from("audit_log")
          .select("id, actor, action, entity, details, created_at")
          .order("created_at", { ascending: false })
          .limit(limit)
      );
    },

    async getAboutMe() {
      const row = unwrapMaybe(await db.from("settings").select("about_me").maybeSingle());
      return (row as { about_me: string } | null)?.about_me ?? "";
    },
    async setAboutMe(text) {
      check(await db.from("settings").upsert({ user_id: userId, about_me: text }, { onConflict: "user_id" }));
    },

    async listGoals() {
      return unwrap(await db.from("goals").select("id, title, why, target_date, status, created_at").order("created_at"));
    },
    async createGoal(fields) {
      return unwrap(
        await db
          .from("goals")
          .insert({ ...fields, user_id: userId })
          .select("id, title, why, target_date, status, created_at")
          .single()
      );
    },
    async updateGoal(id, fields) {
      check(await db.from("goals").update(fields).eq("id", id));
    },
    async deleteGoal(id) {
      check(await db.from("goals").delete().eq("id", id));
    },

    async listProjects() {
      return unwrap(
        await db
          .from("projects")
          .select("id, goal_id, title, status, progress_mode, manual_percent")
          .order("created_at")
      );
    },
    async createProject(fields) {
      return unwrap(
        await db
          .from("projects")
          .insert({ ...fields, user_id: userId })
          .select("id, goal_id, title, status, progress_mode, manual_percent")
          .single()
      );
    },
    async updateProject(id, fields) {
      check(await db.from("projects").update(fields).eq("id", id));
    },
    async deleteProject(id) {
      check(await db.from("projects").delete().eq("id", id));
    },

    async listTasks() {
      return unwrap(
        await db
          .from("tasks")
          .select("id, project_id, title, due_date, status, estimate_minutes, category, track_id")
          .order("created_at")
      );
    },
    async listTasksDue(from, to) {
      return unwrap(
        await db
          .from("tasks")
          .select("id, project_id, title, due_date, status, estimate_minutes, category, track_id")
          .gte("due_date", from)
          .lte("due_date", to)
          .order("due_date")
      );
    },
    async createTask(fields) {
      return unwrap(
        await db
          .from("tasks")
          .insert({ ...fields, user_id: userId })
          .select("id, project_id, title, due_date, status, estimate_minutes, category, track_id")
          .single()
      );
    },
    async updateTask(id, fields) {
      check(await db.from("tasks").update(fields).eq("id", id));
    },
    async deleteTask(id) {
      check(await db.from("tasks").delete().eq("id", id));
    },

    async listTracks() {
      return unwrap(await db.from("learning_tracks").select("id, kind, title, created_at").order("created_at"));
    },
    async createTrack(fields) {
      return unwrap(
        await db
          .from("learning_tracks")
          .insert({ ...fields, user_id: userId })
          .select("id, kind, title, created_at")
          .single()
      );
    },
    async updateTrack(id, fields) {
      check(await db.from("learning_tracks").update(fields).eq("id", id));
    },
    async deleteTrack(id) {
      check(await db.from("learning_tracks").delete().eq("id", id));
    },

    async listUnits() {
      return unwrap(await db.from("learning_units").select("id, track_id, title, position, percent").order("position"));
    },
    async createUnit(fields) {
      check(await db.from("learning_units").insert({ ...fields, user_id: userId }));
    },
    async updateUnit(id, fields) {
      check(await db.from("learning_units").update(fields).eq("id", id));
    },
    async deleteUnit(id) {
      check(await db.from("learning_units").delete().eq("id", id));
    },

    async upsertSnapshots(snapshots) {
      check(
        await db
          .from("progress_snapshots")
          .upsert(
            snapshots.map((snapshot) => ({ ...snapshot, user_id: userId })),
            { onConflict: "user_id,date,entity_type,entity_id" }
          )
      );
    },
    async listSnapshots(entityType, entityIds) {
      if (entityIds.length === 0) return [];
      return unwrap(
        await db
          .from("progress_snapshots")
          .select("date, entity_type, entity_id, percent")
          .eq("entity_type", entityType)
          .in("entity_id", entityIds)
          .order("date")
      );
    },

    async listHabits() {
      return unwrap(await db.from("habits").select("id, title, target_per_week, active, created_at").order("created_at"));
    },
    async createHabit(fields) {
      check(await db.from("habits").insert({ ...fields, user_id: userId }));
    },
    async updateHabit(id, fields) {
      check(await db.from("habits").update(fields).eq("id", id));
    },
    async deleteHabit(id) {
      check(await db.from("habits").delete().eq("id", id));
    },

    async listCheckins(from, to) {
      return unwrap(await db.from("habit_checkins").select("habit_id, date").gte("date", from).lte("date", to));
    },
    async addCheckin(habitId, date) {
      check(await db.from("habit_checkins").insert({ user_id: userId, habit_id: habitId, date }));
    },
    async removeCheckin(habitId, date) {
      check(await db.from("habit_checkins").delete().eq("habit_id", habitId).eq("date", date));
    },

    async getWidgetLayout(device) {
      const row = unwrapMaybe(await db.from("widget_layouts").select("layout").eq("device", device).maybeSingle());
      return (row as { layout: WidgetSetting[] } | null)?.layout ?? null;
    },
    async saveWidgetLayout(device, layout) {
      check(
        await db.from("widget_layouts").upsert({ user_id: userId, device, layout }, { onConflict: "user_id,device" })
      );
    },

    async getGameState() {
      const row = unwrapMaybe(await db.from("game_state").select(STATE_COLUMNS).eq("user_id", userId).maybeSingle());
      return row ? toGameState(row as unknown as GameState) : null;
    },
    async createGameState() {
      check(
        await db.from("game_state").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
      );
    },
    async commitGame(commit) {
      const result = await db.rpc("apply_game_commit", { owner_id: userId, commit_data: commit });
      if (result.error) throw new Error("Game commit failed");
      return result.data === true;
    },
    async setSeenProgress(level, tier) {
      check(await db.from("game_state").update({ seen_level: level, seen_tier: tier }).eq("user_id", userId));
    },

    async listLedger(limit) {
      const rows = unwrap(
        await db.from("game_ledger").select(LEDGER_COLUMNS).order("created_at", { ascending: false }).limit(limit)
      ) as unknown as LedgerEntry[];
      return rows.map(toLedgerEntry);
    },
    async listLedgerForBlocks(blockIds) {
      if (blockIds.length === 0) return [];
      const rows = unwrap(
        await db.from("game_ledger").select(LEDGER_COLUMNS).in("block_instance_id", blockIds)
      ) as unknown as LedgerEntry[];
      return rows.map(toLedgerEntry);
    },
    async listAllLedger() {
      const rows = unwrap(
        await db.from("game_ledger").select(LEDGER_COLUMNS).order("created_at")
      ) as unknown as LedgerEntry[];
      return rows.map(toLedgerEntry);
    },

    async getClosedDay(date) {
      return unwrapMaybe(await db.from("closed_days").select("date, created_at").eq("date", date).maybeSingle());
    },
    async earliestInstanceDate() {
      const row = unwrapMaybe(
        await db.from("block_instances").select("date").order("date").limit(1).maybeSingle()
      );
      return (row as { date: string } | null)?.date ?? null;
    },

    async getSummary(date) {
      const row = unwrapMaybe(
        await db.from("daily_summaries").select(SUMMARY_COLUMNS).eq("date", date).maybeSingle()
      );
      return row ? toSummary(row as unknown as DailySummary) : null;
    },
    async listSummariesFrom(date) {
      const rows = unwrap(
        await db.from("daily_summaries").select(SUMMARY_COLUMNS).gte("date", date).order("date")
      ) as unknown as DailySummary[];
      return rows.map(toSummary);
    },
    async latestSummary() {
      const row = unwrapMaybe(
        await db.from("daily_summaries").select(SUMMARY_COLUMNS).order("date", { ascending: false }).limit(1).maybeSingle()
      );
      return row ? toSummary(row as unknown as DailySummary) : null;
    },
    async listUnseenSummaries() {
      const rows = unwrap(
        await db.from("daily_summaries").select(SUMMARY_COLUMNS).is("seen_at", null).order("date")
      ) as unknown as DailySummary[];
      return rows.map(toSummary);
    },
    async markSummariesSeen(at) {
      check(await db.from("daily_summaries").update({ seen_at: at }).is("seen_at", null));
    },

    async listTemplates() {
      return unwrap(await db.from("loop_templates").select("id, name, created_at").order("created_at"));
    },
    async createTemplate(name) {
      return unwrap(
        await db.from("loop_templates").insert({ user_id: userId, name }).select("id, name, created_at").single()
      );
    },
    async renameTemplate(id, name) {
      check(await db.from("loop_templates").update({ name }).eq("id", id));
    },
    async deleteTemplate(id) {
      check(await db.from("loop_templates").delete().eq("id", id));
    },

    async listActivations() {
      return unwrap(await db.from("template_activations").select("id, template_id, effective_from"));
    },
    async upsertActivation(templateId, effectiveFrom) {
      check(
        await db
          .from("template_activations")
          .upsert(
            { user_id: userId, template_id: templateId, effective_from: effectiveFrom },
            { onConflict: "user_id,effective_from" }
          )
      );
    },

    async listBlocks() {
      const rows = unwrap(
        await db.from("template_blocks").select("*").order("weekday").order("start_time")
      ) as TemplateBlock[];
      return rows.map(toBlock);
    },
    async getBlock(id) {
      const row = unwrapMaybe(await db.from("template_blocks").select("*").eq("id", id).maybeSingle());
      return row ? toBlock(row as TemplateBlock) : null;
    },
    async createBlock(block) {
      check(await db.from("template_blocks").insert({ ...block, user_id: userId }));
    },
    async updateBlock(id, patch) {
      check(await db.from("template_blocks").update(patch).eq("id", id));
    },
    async deleteBlock(id) {
      check(await db.from("template_blocks").delete().eq("id", id));
    },

    async listInstances(from, to) {
      const rows = unwrap(
        await db
          .from("block_instances")
          .select("*")
          .gte("date", from)
          .lte("date", to)
          .order("date")
          .order("start_time")
      ) as BlockInstance[];
      return rows.map(toInstance);
    },
    async getInstance(id) {
      const row = unwrapMaybe(await db.from("block_instances").select("*").eq("id", id).maybeSingle());
      return row ? toInstance(row as BlockInstance) : null;
    },
    async getInstanceByEvent(eventId) {
      const row = unwrapMaybe(await db.from("block_instances").select("*").eq("event_id", eventId).maybeSingle());
      return row ? toInstance(row as BlockInstance) : null;
    },
    async latestTemplateInstanceDate() {
      const row = unwrapMaybe(
        await db
          .from("block_instances")
          .select("date")
          .not("template_block_id", "is", null)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle()
      );
      return (row as { date: string } | null)?.date ?? null;
    },
    async insertInstances(rows) {
      if (rows.length === 0) return;
      const owned = rows.map((row) => ({ ...row, user_id: userId }));
      const fromEvents = owned.filter((row) => row.event_id);
      const fromTemplates = owned.filter((row) => !row.event_id);
      if (fromTemplates.length > 0) {
        check(
          await db
            .from("block_instances")
            .upsert(fromTemplates, { onConflict: "user_id,template_block_id,date", ignoreDuplicates: true })
        );
      }
      if (fromEvents.length > 0) {
        check(
          await db
            .from("block_instances")
            .upsert(fromEvents, { onConflict: "user_id,event_id", ignoreDuplicates: true })
        );
      }
    },
    async updateInstance(id, patch) {
      check(await db.from("block_instances").update(patch).eq("id", id));
    },
    async deleteInstance(id) {
      check(await db.from("block_instances").delete().eq("id", id));
    },
    async deleteRegenerableInstances(fromDate) {
      check(
        await db
          .from("block_instances")
          .delete()
          .gte("date", fromDate)
          .not("template_block_id", "is", null)
          .eq("is_edited", false)
          .in("status", ["planned", "rest"])
      );
    },
    async setDayStatus(date, fromStatuses, to) {
      check(await db.from("block_instances").update({ status: to }).eq("date", date).in("status", fromStatuses));
    },

    async listRestDays(from, to) {
      return unwrap(await db.from("rest_days").select("id, date, kind").gte("date", from).lte("date", to));
    },
    async addRestDay(date, kind) {
      check(await db.from("rest_days").insert({ user_id: userId, date, kind }));
    },
    async deleteRestDay(date) {
      check(await db.from("rest_days").delete().eq("date", date));
    },

    async listEvents(from, to) {
      const rows = unwrap(
        await db.from("events").select("*").lte("start_date", to).gte("end_date", from).order("start_date")
      ) as CalendarEvent[];
      return rows.map(toEvent);
    },
    async getEvent(id) {
      const row = unwrapMaybe(await db.from("events").select("*").eq("id", id).maybeSingle());
      return row ? toEvent(row as CalendarEvent) : null;
    },
    async createEvent(event) {
      const row = unwrap(
        await db.from("events").insert({ ...event, user_id: userId }).select("*").single()
      ) as CalendarEvent;
      return toEvent(row);
    },
    async updateEvent(id, event) {
      check(await db.from("events").update(event).eq("id", id));
    },
    async deleteEvent(id) {
      check(await db.from("events").delete().eq("id", id));
    },
  };
}
