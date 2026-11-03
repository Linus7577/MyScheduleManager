import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { FocusTimerLoader } from "@/features/game/components/focus-timer-loader";
import { getScheduleContext } from "@/features/schedule/context";
import { durationMinutes } from "@/features/schedule/logic";

export default async function FocusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const ctx = await getScheduleContext();
  const instance = await ctx.repo.getInstance(id);
  if (!instance || instance.is_cancelled) notFound();
  if (instance.date !== ctx.today || instance.status === "rest") redirect("/loop");

  return (
    <FocusTimerLoader
      id={instance.id}
      title={instance.title}
      minutes={durationMinutes(instance.start_time, instance.end_time)}
      logNote={instance.log_note}
    />
  );
}
