import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { LayoutTemplate, Repeat } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DayControls } from "@/features/schedule/components/day-controls";
import { InstanceCard } from "@/features/schedule/components/instance-card";
import { WeekStrip } from "@/features/schedule/components/week-strip";
import { getScheduleContext } from "@/features/schedule/context";
import { dateSchema } from "@/features/schedule/schema";
import { ensureLoopReady, getDayView, getTemplatesView } from "@/features/schedule/service";
import { cn } from "@/lib/utils";

export default async function LoopPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const t = await getTranslations("loop");
  const templatesT = await getTranslations("templates");
  const format = await getFormatter();
  const ctx = await getScheduleContext();

  await ensureLoopReady(ctx, [templatesT("seedSemester"), templatesT("seedExam"), templatesT("seedHoliday")]);

  const { date: requested } = await searchParams;
  const date = dateSchema.safeParse(requested).success ? (requested as string) : ctx.today;
  const [day, templates, tracks] = await Promise.all([getDayView(ctx, date), getTemplatesView(ctx), ctx.repo.listTracks()]);
  const active = templates.templates.find((template) => template.id === templates.activeId);
  const activeName = active?.name;
  // The easy mistake: carving blocks into a template that isn't the active one.
  const blocksElsewhere =
    active?.blockCount === 0 ? templates.templates.find((template) => template.id !== active.id && template.blockCount > 0) : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          {activeName && <p className="truncate text-sm text-muted-foreground">{t("activeTemplate", { name: activeName })}</p>}
        </div>
        <Link href="/loop/templates" className={cn(buttonVariants({ variant: "outline" }), "h-11 shrink-0 gap-1.5 px-3")}>
          <LayoutTemplate className="size-4" aria-hidden="true" />
          {t("templates")}
        </Link>
      </div>

      <WeekStrip date={date} today={ctx.today} />

      <h2 className="text-base font-semibold">
        {format.dateTime(new Date(`${date}T00:00:00Z`), { dateStyle: "full", timeZone: "UTC" })}
      </h2>

      <DayControls
        date={date}
        today={ctx.today}
        restDay={day.restDay}
        restDaysUsed={day.restDaysUsed}
        shieldsUsed={day.shieldsUsed}
      />

      {day.instances.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-4 py-10 text-center ring-1 ring-foreground/10">
          <Repeat className="size-8 text-crimson-400" aria-hidden="true" />
          <p className="max-w-sm text-base">{t("flavor")}</p>
          {blocksElsewhere && activeName && (
            <p className="max-w-sm text-sm text-ember-300">
              {t("blocksInOtherTemplate", { other: blocksElsewhere.name, active: activeName })}
            </p>
          )}
          <Link href="/loop/templates" className="text-sm text-crimson-400 underline-offset-4 hover:underline">
            {blocksElsewhere ? t("chooseTemplate") : t("emptyAction")}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {day.instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              overlapping={day.overlaps.has(instance.id)}
              isFuture={date > ctx.today}
              isToday={date === ctx.today}
              tracks={tracks}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
