import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getScheduleContext } from "@/features/schedule/context";
import { buildIcs } from "@/features/schedule/ics";

export async function GET() {
  try {
    const ctx = await getScheduleContext();
    return new Response(buildIcs(await ctx.repo.listAllEvents(), ctx.timeZone), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="my-schedule-${ctx.today}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
