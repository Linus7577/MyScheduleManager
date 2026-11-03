import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getScheduleContext } from "@/features/schedule/context";
import { calendarRangeSchema } from "@/features/schedule/schema";
import { getCalendarFeed } from "@/features/schedule/service";

export async function GET(request: NextRequest) {
  const parsed = calendarRangeSchema.safeParse({
    start: request.nextUrl.searchParams.get("start"),
    end: request.nextUrl.searchParams.get("end"),
  });
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const ctx = await getScheduleContext();
    return NextResponse.json({ ok: true, items: await getCalendarFeed(ctx, parsed.data.start, parsed.data.end) });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
