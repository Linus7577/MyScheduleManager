import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleRepo } from "./repo";
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

/** Every query runs as the signed-in owner, so RLS still applies underneath this code. */
export function createSupabaseRepo(db: SupabaseClient, userId: string): ScheduleRepo {
  return {
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
