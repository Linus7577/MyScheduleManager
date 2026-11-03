import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { TemplatesList } from "@/features/schedule/components/templates-list";
import { getScheduleContext } from "@/features/schedule/context";
import { ensureLoopReady, getTemplatesView } from "@/features/schedule/service";

export default async function TemplatesPage() {
  const t = await getTranslations("templates");
  const ctx = await getScheduleContext();
  await ensureLoopReady(ctx, [t("seedSemester"), t("seedExam"), t("seedHoliday")]);
  const view = await getTemplatesView(ctx);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/loop" className="flex h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("backToLoop")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <TemplatesList
        templates={view.templates}
        activeId={view.activeId}
        upcoming={view.upcoming}
        today={ctx.today}
      />
    </div>
  );
}
