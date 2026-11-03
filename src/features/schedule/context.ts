import "server-only";
import { getOwnerTimezone } from "@/features/settings/queries";
import { requireOwner } from "@/lib/auth/owner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInTimeZone } from "@/lib/time/today";
import { getPreviewRepo } from "./memory-repo";
import { createSupabaseRepo } from "./supabase-repo";
import type { ScheduleContext } from "./service";

/** Confirms the owner first, then picks storage. "Today" always comes from the owner's timezone. */
export async function getScheduleContext(): Promise<ScheduleContext & { timeZone: string }> {
  const owner = await requireOwner();
  const timeZone = await getOwnerTimezone();
  const today = todayInTimeZone(timeZone);

  if (owner.preview) return { repo: getPreviewRepo(), today, timeZone };

  const db = await createSupabaseServerClient();
  if (!db) throw new Error("Supabase is not configured");
  return { repo: createSupabaseRepo(db, owner.userId), today, timeZone };
}
