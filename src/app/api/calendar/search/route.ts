import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getScheduleContext } from "@/features/schedule/context";
import { calendarSearchSchema } from "@/features/schedule/schema";
import { searchCalendar } from "@/features/schedule/service";

export async function GET(request: NextRequest) {
  const parsed = calendarSearchSchema.safeParse({ q: request.nextUrl.searchParams.get("q") });
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const ctx = await getScheduleContext();
    return NextResponse.json({ ok: true, hits: await searchCalendar(ctx, parsed.data.q) });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
