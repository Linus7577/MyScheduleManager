"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createBlockAction, deleteBlockAction, updateBlockAction } from "../actions";
import { findTemplateOverlaps } from "../logic";
import type { BlockFields as BlockValues, TemplateBlock } from "../types";
import { BlockFields, EMPTY_BLOCK, type TrackOption } from "./block-fields";
import { FormDialog } from "./form-dialog";
import { CATEGORY_COLOR, FIELD_CLASS } from "./meta";
import { SwitchDialog } from "./templates-list";
import { useScheduleAction } from "./use-action";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

type DialogState = { block: TemplateBlock | null; weekday: number } | null;

function BlockDialog(props: {
  templateId: string;
  block: TemplateBlock | null;
  weekday: number;
  tracks: TrackOption[];
  onClose: () => void;
}) {
  const t = useTranslations("templates");
  const weekdays = useTranslations("weekdays");
  const { pending, error, run } = useScheduleAction();
  const { block } = props;
  const [weekday, setWeekday] = useState(props.weekday);
  const [values, setValues] = useState<BlockValues>(
    block
      ? {
          start_time: block.start_time,
          end_time: block.end_time,
          category: block.category,
          title: block.title,
          notes: block.notes,
          track_id: block.track_id ?? null,
        }
      : EMPTY_BLOCK
  );

  return (
    <FormDialog
      open
      onClose={props.onClose}
      title={block ? t("editBlock") : t("addBlock")}
      pending={pending}
      error={error}
      onSubmit={() =>
        run(
          () =>
            block
              ? updateBlockAction({ id: block.id, weekday, ...values })
              : createBlockAction({ template_id: props.templateId, weekday, ...values }),
          props.onClose
        )
      }
      extraAction={
        block ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="h-11 px-2"
            onClick={() => run(() => createBlockAction({ template_id: props.templateId, weekday, ...values }), props.onClose)}
          >
            {t("saveAsNew")}
          </Button>
        ) : undefined
      }
    >
      {block && <p className="text-xs text-muted-foreground">{t("editReplacesHint")}</p>}
      <div className="flex flex-col gap-2">
        <Label htmlFor="block-weekday">{t("weekday")}</Label>
        <select
          id="block-weekday"
          className={FIELD_CLASS}
          value={weekday}
          onChange={(event) => setWeekday(Number(event.target.value))}
        >
          {WEEKDAYS.map((day) => (
            <option key={day} value={day}>
              {weekdays(String(day))}
            </option>
          ))}
        </select>
      </div>
      <BlockFields value={values} onChange={setValues} tracks={props.tracks} />
      <p className="text-xs text-muted-foreground">{t("blockEditHint")}</p>
    </FormDialog>
  );
}

export function TemplateEditor(props: {
  templateId: string;
  templateName: string;
  blocks: TemplateBlock[];
  tracks: TrackOption[];
  isActive: boolean;
  scheduledFrom: string | null;
  activeName: string | null;
  today: string;
}) {
  const t = useTranslations("templates");
  const weekdays = useTranslations("weekdays");
  const categories = useTranslations("categories");
  const format = useFormatter();
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [switching, setSwitching] = useState(false);
  const overlaps = findTemplateOverlaps(props.blocks);

  function remove(block: TemplateBlock) {
    if (!window.confirm(t("deleteBlockConfirm", { title: block.title }))) return;
    run(() => deleteBlockAction({ id: block.id }));
  }

  return (
    <div className="flex flex-col gap-4">
      {!props.isActive && (
        <section
          aria-label={t("notActiveLabel")}
          className="flex flex-col gap-3 rounded-xl bg-ember-950 p-4 text-sm text-ember-100 ring-1 ring-ember-800"
        >
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {props.scheduledFrom
                ? t("scheduledWarning", {
                    date: format.dateTime(new Date(`${props.scheduledFrom}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }),
                  })
                : t("notActiveWarning", { active: props.activeName ?? "" })}
            </span>
          </p>
          <Button type="button" variant="outline" className="h-11 w-fit px-4" onClick={() => setSwitching(true)}>
            {t("makeActive")}
          </Button>
        </section>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {WEEKDAYS.map((weekday) => {
        const blocks = props.blocks.filter((block) => block.weekday === weekday);
        return (
          <section key={weekday} className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{weekdays(String(weekday))}</h2>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-1.5 px-3"
                aria-label={t("addBlockOn", { day: weekdays(String(weekday)) })}
                onClick={() => setDialog({ block: null, weekday })}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("add")}
              </Button>
            </div>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("emptyDay")}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {blocks.map((block) => (
                  <li key={block.id} className="flex items-center gap-2 py-2">
                    <span
                      aria-hidden="true"
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLOR[block.category] }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">{block.title}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {block.start_time}–{block.end_time} · {categories(block.category)}
                      </p>
                      {overlaps.has(block.id) && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-ember-400">
                          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                          {t("overlapWarning")}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-10"
                      aria-label={t("editBlockNamed", { title: block.title })}
                      onClick={() => setDialog({ block, weekday })}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-10 text-destructive"
                      aria-label={t("deleteBlockNamed", { title: block.title })}
                      disabled={pending}
                      onClick={() => remove(block)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {switching && (
        <SwitchDialog
          template={{ id: props.templateId, name: props.templateName }}
          today={props.today}
          onClose={() => setSwitching(false)}
        />
      )}
      {dialog && (
        <BlockDialog
          templateId={props.templateId}
          block={dialog.block}
          weekday={dialog.weekday}
          tracks={props.tracks}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
