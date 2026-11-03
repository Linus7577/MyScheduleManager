"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createTemplateAction,
  deleteTemplateAction,
  renameTemplateAction,
  switchTemplateAction,
} from "../actions";
import type { TemplateActivation } from "../types";
import { FormDialog } from "./form-dialog";
import { useScheduleAction } from "./use-action";

type TemplateRow = { id: string; name: string; blockCount: number };
type DialogState = { type: "switch" | "rename"; template: TemplateRow } | { type: "new" } | null;

export function SwitchDialog(props: { template: { id: string; name: string }; today: string; onClose: () => void }) {
  const t = useTranslations("templates");
  const { pending, error, run } = useScheduleAction();
  const [effectiveFrom, setEffectiveFrom] = useState(props.today);

  return (
    <FormDialog
      open
      onClose={props.onClose}
      title={t("switchTitle", { name: props.template.name })}
      pending={pending}
      error={error}
      onSubmit={() =>
        run(() => switchTemplateAction({ id: props.template.id, effective_from: effectiveFrom }), props.onClose)
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="effective-from">{t("effectiveFrom")}</Label>
        <Input
          id="effective-from"
          type="date"
          required
          min={props.today}
          className="h-11"
          value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("switchHint")}</p>
      </div>
    </FormDialog>
  );
}

function NameDialog(props: { template?: TemplateRow; onClose: () => void }) {
  const t = useTranslations("templates");
  const { pending, error, run } = useScheduleAction();
  const [name, setName] = useState(props.template?.name ?? "");
  const { template } = props;

  return (
    <FormDialog
      open
      onClose={props.onClose}
      title={template ? t("renameTitle") : t("newTitle")}
      pending={pending}
      error={error}
      onSubmit={() =>
        run(
          () => (template ? renameTemplateAction({ id: template.id, name }) : createTemplateAction({ name })),
          props.onClose
        )
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="template-name">{t("name")}</Label>
        <Input
          id="template-name"
          required
          maxLength={80}
          className="h-11"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
    </FormDialog>
  );
}

export function TemplatesList(props: {
  templates: TemplateRow[];
  activeId: string | null;
  upcoming: TemplateActivation[];
  today: string;
}) {
  const t = useTranslations("templates");
  const format = useFormatter();
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<DialogState>(null);

  function remove(template: TemplateRow) {
    if (!window.confirm(t("deleteConfirm", { name: template.name }))) return;
    run(() => deleteTemplateAction({ id: template.id }));
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {props.templates.map((template) => {
          const isActive = template.id === props.activeId;
          const next = props.upcoming.find((activation) => activation.template_id === template.id);
          return (
            <li key={template.id} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 font-sans text-base font-medium break-words">{template.name}</h2>
                {isActive && (
                  <span className="rounded-full bg-crimson-950 px-2 py-0.5 text-xs text-crimson-200 ring-1 ring-crimson-700">
                    {t("active")}
                  </span>
                )}
                {next && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                    {t("startsOn", {
                      date: format.dateTime(new Date(`${next.effective_from}T00:00:00Z`), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }),
                    })}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("blockCount", { count: template.blockCount })}</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/loop/templates/${template.id}`}
                  className={cn(buttonVariants(), "h-10 px-3")}
                  aria-label={t("editBlocksFor", { name: template.name })}
                >
                  {t("editBlocks")}
                </Link>
                {!isActive && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-3"
                    onClick={() => setDialog({ type: "switch", template })}
                  >
                    {t("makeActive")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 px-3"
                  onClick={() => setDialog({ type: "rename", template })}
                >
                  {t("rename")}
                </Button>
                {!isActive && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 px-3 text-destructive"
                    disabled={pending}
                    onClick={() => remove(template)}
                  >
                    {t("delete")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="outline" className="h-11" onClick={() => setDialog({ type: "new" })}>
        {t("newTemplate")}
      </Button>

      {dialog?.type === "switch" && (
        <SwitchDialog template={dialog.template} today={props.today} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === "rename" && <NameDialog template={dialog.template} onClose={() => setDialog(null)} />}
      {dialog?.type === "new" && <NameDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
