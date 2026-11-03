import "server-only";
import { cache } from "react";
import { runPendingCloseouts } from "@/features/game/service";
import { getOwnerTimezone } from "@/features/settings/queries";
import { requireOwner } from "@/lib/auth/owner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInTimeZone, wallClockInTimeZone } from "@/lib/time/today";
import { getPreviewRepo } from "./memory-repo";
import { withRequestCache } from "./request-cache";
import { createSupabaseRepo } from "./supabase-repo";
import type { ScheduleContext } from "./generation";

/**
 * Confirms the owner, picks storage and works out "today" in the owner's timezone. It also runs any overdue
 * closeout first, so no page or action ever works from a day that should already be closed.
 */
export const getScheduleContext = cache(async (): Promise<ScheduleContext & { timeZone: string }> => {
  const owner = await requireOwner();
  const timeZone = await getOwnerTimezone();
  const now = new Date();
  const base = { today: todayInTimeZone(timeZone, now), now, wallClock: wallClockInTimeZone(timeZone, now), timeZone };

  if (owner.preview) {
    const ctx = { ...base, repo: getPreviewRepo() };
    await runPendingCloseouts(ctx);
    return ctx;
  }

  const db = await createSupabaseServerClient();
  if (!db) throw new Error("Supabase is not configured");
  const ctx = { ...base, repo: withRequestCache(createSupabaseRepo(db, owner.userId)) };
  await runPendingCloseouts(ctx);
  return ctx;
});
