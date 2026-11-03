import { GoalsList } from "@/features/command/components/goals-list";
import { getGoalsView } from "@/features/command/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function GoalsPage() {
  const ctx = await getScheduleContext();
  const goals = await getGoalsView(ctx);

  return (
    <div className="mx-auto max-w-2xl">
      <GoalsList goals={goals} />
    </div>
  );
}
