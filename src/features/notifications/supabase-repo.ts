import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationRepo } from "./repo";
import { DEFAULT_NOTIFICATIONS, type NotificationSettings, type PushDevice } from "./types";

const SETTINGS_COLUMNS = "notify_weekly, notify_block_start, notify_open_blocks, notify_low_power";

export function createNotificationSupabaseRepo(db: SupabaseClient, userId: string): NotificationRepo {
  // The nightly timers use a client that can see every row, so each query names its owner itself.
  function check<T extends { error: unknown }>(result: T): T {
    if (result.error) throw new Error("Notification query failed");
    return result;
  }

  return {
    async getNotificationSettings() {
      const { data } = check(await db.from("settings").select(SETTINGS_COLUMNS).eq("user_id", userId).maybeSingle());
      return (data as NotificationSettings | null) ?? DEFAULT_NOTIFICATIONS;
    },
    async saveNotificationSettings(settings) {
      check(await db.from("settings").upsert({ user_id: userId, ...settings }, { onConflict: "user_id" }));
    },
    async listPushDevices() {
      const { data } = check(await db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId));
      return (data ?? []) as PushDevice[];
    },
    async savePushDevice(device) {
      check(await db.from("push_subscriptions").upsert({ user_id: userId, ...device }, { onConflict: "user_id,endpoint" }));
    },
    async deletePushDevice(endpoint) {
      check(await db.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint));
    },
    async claimNotification(kind, key) {
      const { data } = check(
        await db
          .from("notification_log")
          .upsert({ user_id: userId, kind, key }, { onConflict: "user_id,kind,key", ignoreDuplicates: true })
          .select("id")
      );
      return (data ?? []).length > 0;
    },
    async pruneNotificationLog(before) {
      check(await db.from("notification_log").delete().eq("user_id", userId).lt("created_at", before.toISOString()));
    },
  };
}
