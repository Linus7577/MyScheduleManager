import { NextResponse } from "next/server";
import { sendPush } from "@/features/notifications/push";
import { runWeeklyRitual } from "@/features/notifications/service";
import { getAiProvider } from "@/features/oracle/provider-config";
import { findOwnerId, ownerContext } from "@/lib/cron/owner";
import { isAuthorizedCron } from "@/lib/security/cron";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Sunday night: the Oracle writes the week's review, then the owner's devices get the push. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  try {
    const ownerId = await findOwnerId(admin);
    if (!ownerId) return NextResponse.json({ ok: true, written: false, sent: 0 });
    const ctx = await ownerContext(admin, ownerId);
    const result = await runWeeklyRitual(ctx, getAiProvider(), (message) => sendPush(ctx.repo, message));
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
