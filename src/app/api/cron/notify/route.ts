import { NextResponse } from "next/server";
import { sendPush } from "@/features/notifications/push";
import { runNotificationTick } from "@/features/notifications/service";
import { findOwnerId, ownerContext } from "@/lib/cron/owner";
import { isAuthorizedCron } from "@/lib/security/cron";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Sends the optional notifications. Vercel's free timers run once a day at most, so a free timer
 * in the database calls this every five minutes. See "Notifications timer" in docs/SETUP.md.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  try {
    const ownerId = await findOwnerId(admin);
    if (!ownerId) return NextResponse.json({ ok: true, sent: 0 });
    const ctx = await ownerContext(admin, ownerId);
    return NextResponse.json({ ok: true, sent: await runNotificationTick(ctx, (message) => sendPush(ctx.repo, message)) });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = GET;
