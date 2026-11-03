import { getLocale, getTranslations } from "next-intl/server";
import { CalendarLoader } from "@/features/schedule/components/calendar-loader";
import { getScheduleContext } from "@/features/schedule/context";
import { ensureLoopReady } from "@/features/schedule/service";

export default async function CalendarPage() {
  const templates = await getTranslations("templates");
  const locale = await getLocale();
  const ctx = await getScheduleContext();
  await ensureLoopReady(ctx, [templates("seedSemester"), templates("seedExam"), templates("seedHoliday")]);

  return (
    <div className="mx-auto max-w-5xl">
      <CalendarLoader timeZone={ctx.timeZone} locale={locale} today={ctx.today} />
    </div>
  );
}
