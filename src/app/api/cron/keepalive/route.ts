import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/security/cron";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Daily database touch, so Supabase Free doesn't pause the project. Phase 2 adds the day closeout here. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const { error } = await admin.from("settings").select("id", { head: true, count: "exact" });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });

  return NextResponse.json({ ok: true });
}
