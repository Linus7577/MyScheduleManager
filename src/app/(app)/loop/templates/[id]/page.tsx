import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { TemplateEditor } from "@/features/schedule/components/template-editor";
import { getScheduleContext } from "@/features/schedule/context";
import { getTemplateEditor } from "@/features/schedule/service";

export default async function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const t = await getTranslations("templates");
  const editor = await getTemplateEditor(await getScheduleContext(), id);
  if (!editor) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/loop/templates"
        className="flex h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("title")}
      </Link>
      <h1 className="text-2xl font-semibold break-words">{editor.template.name}</h1>
      <TemplateEditor templateId={editor.template.id} blocks={editor.blocks} />
    </div>
  );
}
