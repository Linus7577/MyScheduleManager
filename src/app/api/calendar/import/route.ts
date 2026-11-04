import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getScheduleContext } from "@/features/schedule/context";
import { MAX_ICS_BYTES } from "@/features/schedule/ics-limits";
import { importCalendar } from "@/features/schedule/service";

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_ICS_BYTES) {
      return NextResponse.json({ ok: false, code: "fileTooLarge" }, { status: 413 });
    }
    const [ctx, t] = await Promise.all([getScheduleContext(), getTranslations("calendar")]);
    return NextResponse.json(await importCalendar(ctx, text, t("untitled")));
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
