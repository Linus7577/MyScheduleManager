import { NextResponse } from "next/server";
import { DEFAULT_TIMEZONE } from "@/config/app.config";
import { runPendingCloseouts } from "@/features/game/service";
import { createSupabaseRepo } from "@/features/schedule/supabase-repo";
import { isAllowedEmail } from "@/lib/auth/access";
import { isAuthorizedCron } from "@/lib/security/cron";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { todayInTimeZone, wallClockInTimeZone } from "@/lib/time/today";

/**
 * The backup trigger for day closeout, which also keeps Supabase Free from pausing the project.
 * It has no signed-in user, so it uses the server-only client and finds the one allow-listed owner itself.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ perPage: 50 });
  if (usersError) return NextResponse.json({ ok: false }, { status: 500 });

  const owner = users.users.find((user) => isAllowedEmail(user.email, process.env.ALLOWED_EMAIL));
  if (!owner) {
    // Nobody has signed in yet. This query is still enough to keep the project active.
    const { error } = await admin.from("settings").select("id", { head: true, count: "exact" });
    return error
      ? NextResponse.json({ ok: false }, { status: 500 })
      : NextResponse.json({ ok: true, closed: 0 });
  }

  try {
    const { data: settings } = await admin.from("settings").select("timezone").eq("user_id", owner.id).maybeSingle();
    const timeZone = settings?.timezone ?? DEFAULT_TIMEZONE;
    const now = new Date();
    const closed = await runPendingCloseouts({
      repo: createSupabaseRepo(admin, owner.id),
      today: todayInTimeZone(timeZone, now),
      wallClock: wallClockInTimeZone(timeZone, now),
      now,
    });
    return NextResponse.json({ ok: true, closed });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
