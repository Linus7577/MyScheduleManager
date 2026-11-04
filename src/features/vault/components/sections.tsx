"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { createSectionAction, deleteSectionAction, renameSectionAction } from "../actions";
import type { VaultSection } from "../types";
import { sectionLabel } from "./item-meta";

function SectionDialog(props: { section: VaultSection | null; currentName: string; onClose: () => void }) {
  const t = useTranslations("vault");
  const { pending, error, run } = useScheduleAction();
  const [name, setName] = useState(props.currentName);
  const { section } = props;

  return (
    <FormDialog
      open
      onClose={props.onClose}
      title={section ? t("renameSection") : t("newSection")}
      pending={pending}
      error={error}
      onSubmit={() => run(() => (section ? renameSectionAction({ id: section.id, name }) : createSectionAction({ name })), props.onClose)}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="section-name">{t("sectionName")}</Label>
        <Input id="section-name" required maxLength={40} className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </FormDialog>
  );
}

export function SectionsPage(props: { sections: VaultSection[]; counts: Record<string, number> }) {
  const t = useTranslations("vault");
  const names = useTranslations("vaultSections");
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<{ section: VaultSection | null } | null>(null);
  const label = (section: VaultSection) => sectionLabel(section, (key) => names(key));

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" className="h-11 w-fit gap-1.5 px-4" onClick={() => setDialog({ section: null })}>
        <Plus className="size-4" aria-hidden="true" />
        {t("newSection")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y rounded-xl bg-card px-4 ring-1 ring-foreground/10">
        {props.sections.map((section) => (
          <li key={section.id} className="flex items-center gap-1 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words">{label(section)}</p>
              <p className="text-xs text-muted-foreground">{t("itemCount", { count: props.counts[section.id] ?? 0 })}</p>
            </div>
            <Button type="button" variant="ghost" className="size-10" aria-label={t("renameNamed", { section: label(section) })} onClick={() => setDialog({ section })}>
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="size-10 text-destructive"
              disabled={pending}
              aria-label={t("deleteSectionNamed", { section: label(section) })}
              onClick={() => {
                if (window.confirm(t("deleteSectionConfirm", { section: label(section) }))) run(() => deleteSectionAction({ id: section.id }));
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {dialog && (
        <SectionDialog section={dialog.section} currentName={dialog.section ? label(dialog.section) : ""} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
