import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { GoalDetail } from "@/features/command/components/goal-detail";
import { getGoalDetail, recordProgressSnapshots } from "@/features/command/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const t = await getTranslations("goals");
  const ctx = await getScheduleContext();
  await recordProgressSnapshots(ctx);
  const detail = await getGoalDetail(ctx, id);
  if (!detail) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/goals" className="flex h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("title")}
      </Link>
      <GoalDetail {...detail} />
    </div>
  );
}
