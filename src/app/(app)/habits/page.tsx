import { HabitsPage } from "@/features/command/components/habits";
import { heatmapWeeks } from "@/features/command/logic";
import { getHabitsView, HEATMAP_WEEKS } from "@/features/command/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function HabitsRoute() {
  const ctx = await getScheduleContext();
  const view = await getHabitsView(ctx);

  return (
    <div className="mx-auto max-w-2xl">
      <HabitsPage habits={view.habits} checkins={view.checkins} weeks={heatmapWeeks(ctx.today, HEATMAP_WEEKS)} today={ctx.today} />
    </div>
  );
}
