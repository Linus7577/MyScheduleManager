import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { getScheduleContext } from "@/features/schedule/context";
import { ItemActions } from "@/features/vault/components/item-actions";
import { ITEM_ICONS, itemIconKey, sectionLabel } from "@/features/vault/components/item-meta";
import { NoteBody } from "@/features/vault/components/note-body";
import { displayHost } from "@/features/vault/logic";
import { getVaultView } from "@/features/vault/service";
import { cn } from "@/lib/utils";

export default async function VaultItemRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const t = await getTranslations("vault");
  const names = await getTranslations("vaultSections");
  const ctx = await getScheduleContext();
  const { sections, items, goals, projects, tracks } = await getVaultView(ctx);
  const item = items.find((row) => row.id === id);
  if (!item) notFound();

  const Icon = ITEM_ICONS[itemIconKey(item)];
  const section = sections.find((row) => row.id === item.section_id);
  const project = projects.find((row) => row.id === item.project_id);
  const linked = item.goal_id
    ? { href: `/goals/${item.goal_id}`, title: goals.find((row) => row.id === item.goal_id)?.title }
    : project
      ? { href: `/goals/${project.goal_id}`, title: project.title }
      : item.track_id
        ? { href: `/learning/${item.track_id}`, title: tracks.find((row) => row.id === item.track_id)?.title }
        : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/vault" className="flex h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("title")}
      </Link>

      <div className="flex items-start gap-2">
        <Icon className="mt-1.5 size-5 shrink-0 text-crimson-400" aria-label={t(`types.${item.type}`)} />
        <h1 className="min-w-0 text-2xl font-semibold break-words">{item.title}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {[sectionLabel(section, (key) => names(key)), displayHost(item.url)].filter(Boolean).join(" · ")}
      </p>
      {item.description && <p className="text-sm break-words">{item.description}</p>}
      {item.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={t("tags")}>
          {item.tags.map((tag) => (
            <li key={tag} className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
              {tag}
            </li>
          ))}
        </ul>
      )}
      {linked && (
        <p className="text-sm">
          {t("linkedTo")}:{" "}
          <Link href={linked.href} className="text-crimson-400 underline-offset-4 hover:underline">
            {linked.title}
          </Link>
        </p>
      )}

      {item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), "h-11 w-fit gap-1.5 px-4")}>
          <ExternalLink className="size-4" aria-hidden="true" />
          {t("open")}
        </a>
      )}
      {item.type === "note" && (
        <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <NoteBody text={item.body} />
        </section>
      )}

      <ItemActions item={item} sections={sections} options={{ goals, projects, tracks }} />
    </div>
  );
}
