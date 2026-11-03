import { LearningList } from "@/features/command/components/learning";
import { getLearningView } from "@/features/command/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function LearningPage() {
  const ctx = await getScheduleContext();
  const view = await getLearningView(ctx);

  return (
    <div className="mx-auto max-w-2xl">
      <LearningList tracks={view.tracks} studyWeeks={view.studyWeeks} />
    </div>
  );
}
