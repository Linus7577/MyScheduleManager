"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FIELD_CLASS } from "@/features/schedule/components/meta";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { cn } from "@/lib/utils";
import { deleteItemAction, setItemPinnedAction } from "../actions";
import { collectTags, displayHost, filterVaultItems } from "../logic";
import { VAULT_ITEM_TYPES, type VaultItem, type VaultItemType, type VaultSection } from "../types";
import { ItemDialog, type LinkOptions } from "./item-dialog";
import { ITEM_ICONS, itemIconKey, sectionLabel } from "./item-meta";

// Three of these share a phone's width, so they use less padding to keep their words whole.
const FILTER_CLASS = cn(FIELD_CLASS, "px-1.5 text-xs");

/** A link opens the place it points to. A note opens here. */
export function ItemTitle({ item }: { item: Pick<VaultItem, "id" | "type" | "title" | "url"> }) {
  const className = "min-h-6 text-sm font-medium break-words underline-offset-4 hover:underline";
  if (item.type === "note" || !item.url) {
    return (
      <Link href={`/vault/${item.id}`} className={className}>
        {item.title}
      </Link>
    );
  }
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className={`${className} inline-flex items-center gap-1`}>
      {item.title}
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
    </a>
  );
}

function ItemRow(props: { item: VaultItem; section: string; onEdit: () => void; onTag: (tag: string) => void }) {
  const t = useTranslations("vault");
  const { pending, error, run } = useScheduleAction();
  const { item } = props;
  const Icon = ITEM_ICONS[itemIconKey(item)];

  return (
    <li className="flex items-start gap-2 py-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-crimson-400" aria-label={t(`types.${item.type}`)} />
      <div className="min-w-0 flex-1">
        <ItemTitle item={item} />
        <p className="text-xs break-words text-muted-foreground">
          {[props.section, displayHost(item.url)].filter(Boolean).join(" · ")}
        </p>
        {item.description && <p className="mt-0.5 text-xs break-words text-muted-foreground">{item.description}</p>}
        {item.tags.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  aria-label={t("filterByTag", { tag })}
                  className="min-h-7 rounded bg-surface-2 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => props.onTag(tag)}
                >
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="size-10"
        disabled={pending}
        aria-pressed={item.pinned}
        aria-label={t(item.pinned ? "unpinNamed" : "pinNamed", { title: item.title })}
        onClick={() => run(() => setItemPinnedAction({ id: item.id, pinned: !item.pinned }))}
      >
        {item.pinned ? <PinOff className="size-4 text-ember-400" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
      </Button>
      <Button type="button" variant="ghost" className="size-10" aria-label={t("editNamed", { title: item.title })} onClick={props.onEdit}>
        <Pencil className="size-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="size-10 text-destructive"
        disabled={pending}
        aria-label={t("deleteNamed", { title: item.title })}
        onClick={() => {
          if (window.confirm(t("deleteConfirm", { title: item.title }))) run(() => deleteItemAction({ id: item.id }));
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}

export function VaultPage(props: { sections: VaultSection[]; items: VaultItem[]; options: LinkOptions }) {
  const t = useTranslations("vault");
  const names = useTranslations("vaultSections");
  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [tag, setTag] = useState("");
  const [type, setType] = useState("");
  const [dialog, setDialog] = useState<{ item: VaultItem | null } | null>(null);

  const tags = useMemo(() => collectTags(props.items), [props.items]);
  const visible = useMemo(
    () =>
      filterVaultItems(props.items, {
        query,
        sectionId: sectionId || null,
        tag: tag || null,
        type: (type || null) as VaultItemType | null,
      }),
    [props.items, query, sectionId, tag, type]
  );
  const filtering = Boolean(query || sectionId || tag || type);
  const label = (id: string) => sectionLabel(props.sections.find((section) => section.id === id), (key) => names(key));

  function clear() {
    setQuery("");
    setSectionId("");
    setTag("");
    setType("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="h-11 gap-1.5 px-4" onClick={() => setDialog({ item: null })}>
          <Plus className="size-4" aria-hidden="true" />
          {t("newItem")}
        </Button>
        <Link href="/vault/sections" className="flex h-11 items-center px-2 text-sm text-crimson-400 underline-offset-4 hover:underline">
          {t("manageSections")}
        </Link>
      </div>

      <section aria-label={t("filtersLabel")} className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label={t("search")}
            placeholder={t("search")}
            className="h-11 pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select aria-label={t("section")} className={FILTER_CLASS} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">{t("allSections")}</option>
            {props.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {label(section.id)}
              </option>
            ))}
          </select>
          <select aria-label={t("tag")} className={FILTER_CLASS} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">{t("allTags")}</option>
            {tags.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select aria-label={t("type")} className={FILTER_CLASS} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t("allTypes")}</option>
            {VAULT_ITEM_TYPES.map((option) => (
              <option key={option} value={option}>
                {t(`types.${option}`)}
              </option>
            ))}
          </select>
        </div>
        {filtering && (
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span role="status">{t("matchCount", { count: visible.length })}</span>
            <Button type="button" variant="ghost" className="h-10 px-2" onClick={clear}>
              {t("clearFilters")}
            </Button>
          </div>
        )}
      </section>

      {props.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMatches")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl bg-card px-4 ring-1 ring-foreground/10">
          {visible.map((item) => (
            <ItemRow key={item.id} item={item} section={label(item.section_id)} onEdit={() => setDialog({ item })} onTag={setTag} />
          ))}
        </ul>
      )}

      {dialog && <ItemDialog item={dialog.item} sections={props.sections} options={props.options} onClose={() => setDialog(null)} />}
    </div>
  );
}
