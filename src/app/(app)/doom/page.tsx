import { DoomClockLoader } from "@/features/game/components/doom-clock-loader";
import { getScheduleContext } from "@/features/schedule/context";
import { getMotionLevel } from "@/features/settings/queries";

export default async function DoomPage() {
  const ctx = await getScheduleContext();
  const [instances, motion] = await Promise.all([ctx.repo.listInstances(ctx.today, ctx.today), getMotionLevel()]);
  const blocks = instances
    .filter((instance) => !instance.is_cancelled)
    .map(({ id, title, start_time, end_time, category, status }) => ({ id, title, start_time, end_time, category, status }));

  return <DoomClockLoader blocks={blocks} today={ctx.today} timeZone={ctx.timeZone} motion={motion} />;
}
