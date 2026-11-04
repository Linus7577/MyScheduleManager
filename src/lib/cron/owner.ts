import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TIMEZONE } from "@/config/app.config";
import { createSupabaseRepo } from "@/features/schedule/supabase-repo";
import { isAllowedEmail } from "@/lib/auth/access";
import { todayInTimeZone, wallClockInTimeZone } from "@/lib/time/today";

/** Timers have no signed-in user, so they find the one allow-listed owner themselves. Null until the owner first signs in. */
export async function findOwnerId(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 50 });
  if (error) throw new Error("Could not list users");
  return data.users.find((user) => isAllowedEmail(user.email, process.env.ALLOWED_EMAIL))?.id ?? null;
}

export async function ownerContext(admin: SupabaseClient, ownerId: string) {
  const { data: settings } = await admin.from("settings").select("timezone, locale").eq("user_id", ownerId).maybeSingle();
  const timeZone = settings?.timezone ?? DEFAULT_TIMEZONE;
  const now = new Date();
  return {
    repo: createSupabaseRepo(admin, ownerId),
    today: todayInTimeZone(timeZone, now),
    wallClock: wallClockInTimeZone(timeZone, now),
    now,
    locale: settings?.locale as string | undefined,
  };
}
