"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, Hourglass, MessageSquare, Pencil, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { cancelInstanceAction, editInstanceAction, logInstanceAction } from "../actions";
import type { BlockFields as BlockValues, BlockInstance, LogStatus } from "../types";
import { BlockFields } from "./block-fields";
import { FormDialog } from "./form-dialog";
import { CATEGORY_COLOR, STATUS_META } from "./meta";
import { useScheduleAction } from "./use-action";

const LOG_STATUSES: LogStatus[] = ["done", "partial", "skipped"];

const blockValues = (instance: BlockInstance): BlockValues => ({
  start_time: instance.start_time,
  end_time: instance.end_time,
  category: instance.category,
  title: instance.title,
  notes: instance.notes,
});

function NoteDialog({ instance, onClose }: { instance: BlockInstance; onClose: () => void }) {
  const t = useTranslations("loop");
  const { pending, error, run } = useScheduleAction();
  const [note, setNote] = useState(instance.log_note);

  return (
    <FormDialog
      open
      onClose={onClose}
      title={t("noteTitle", { title: instance.title })}
      pending={pending}
      error={error}
      onSubmit={() =>
        run(
          () =>
            logInstanceAction({
              id: instance.id,
              status: instance.status === "rest" ? "planned" : instance.status,
              log_note: note,
            }),
          onClose
        )
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="log-note">{t("note")}</Label>
        <Textarea id="log-note" maxLength={1000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </FormDialog>
  );
}

function EditDialog({ instance, onClose }: { instance: BlockInstance; onClose: () => void }) {
  const t = useTranslations("loop");
  const { pending, error, run } = useScheduleAction();
  const [values, setValues] = useState(blockValues(instance));
  const [applyToTemplate, setApplyToTemplate] = useState(false);

  function save() {
    if (applyToTemplate && !window.confirm(t("applyConfirm"))) return;
    run(() => editInstanceAction({ id: instance.id, apply_to_template: applyToTemplate, ...values }), onClose);
  }

  function removeForDay() {
    if (!window.confirm(t("removeConfirm"))) return;
    run(() => cancelInstanceAction({ id: instance.id }), onClose);
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      title={t("editTitle")}
      pending={pending}
      error={error}
      onSubmit={save}
      extraAction={
        instance.status === "planned" || instance.status === "rest" ? (
          <Button type="button" variant="ghost" className="h-11 px-2 text-destructive" onClick={removeForDay}>
            {t("removeForDay")}
          </Button>
        ) : undefined
      }
    >
      <p className="text-xs text-muted-foreground">{t("editHint")}</p>
      <BlockFields value={values} onChange={setValues} />
      {instance.template_block_id && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-crimson-500"
            checked={applyToTemplate}
            onChange={(event) => setApplyToTemplate(event.target.checked)}
          />
          {t("applyToTemplate")}
        </label>
      )}
    </FormDialog>
  );
}

export function InstanceCard(props: { instance: BlockInstance; overlapping: boolean; isFuture: boolean; isToday: boolean }) {
  const { instance, overlapping, isFuture } = props;
  const t = useTranslations("loop");
  const categories = useTranslations("categories");
  const statuses = useTranslations("instanceStatus");
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<"note" | "edit" | null>(null);

  const isRest = instance.status === "rest";
  const canLog = !isRest && !isFuture;
  const StatusIcon = STATUS_META[instance.status].icon;

  function setStatus(status: LogStatus) {
    const next = instance.status === status ? "planned" : status;
    run(() => logInstanceAction({ id: instance.id, status: next, log_note: instance.log_note }));
  }

  return (
    <li className="glow-card flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 h-10 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: CATEGORY_COLOR[instance.category] }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground tabular-nums">
            {instance.start_time}–{instance.end_time} · {categories(instance.category)}
          </p>
          <h3 className="mt-0.5 font-sans text-base font-medium break-words">{instance.title}</h3>
          {instance.notes && <p className="mt-1 text-sm break-words text-muted-foreground">{instance.notes}</p>}
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs font-medium",
            STATUS_META[instance.status].colorClass
          )}
        >
          <StatusIcon className="size-4" aria-hidden="true" />
          {statuses(instance.status)}
        </span>
      </div>

      {overlapping && (
        <p className="flex items-center gap-1.5 text-xs text-ember-400">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {t("overlapWarning")}
        </p>
      )}

      {canLog && (
        <div role="group" aria-label={t("logLabel")} className="grid grid-cols-3 gap-2">
          {LOG_STATUSES.map((status) => {
            const Icon = STATUS_META[status].icon;
            const selected = instance.status === status;
            return (
              <Button
                key={status}
                type="button"
                variant="outline"
                aria-pressed={selected}
                disabled={pending}
                onClick={() => setStatus(status)}
                className={cn(
                  "h-11 gap-1.5 px-1",
                  selected && "border-transparent bg-surface-2 ring-2 ring-current",
                  selected && STATUS_META[status].colorClass
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {statuses(status)}
              </Button>
            );
          })}
        </div>
      )}

      {instance.log_note && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm break-words">{instance.log_note}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {canLog && (
          <Button type="button" variant="ghost" className="h-10 gap-1.5" onClick={() => setDialog("note")}>
            <MessageSquare className="size-4" aria-hidden="true" />
            {t("note")}
          </Button>
        )}
        {canLog && props.isToday && (
          <Link
            href={`/focus/${instance.id}`}
            className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            <Hourglass className="size-4" aria-hidden="true" />
            {t("focus")}
          </Link>
        )}
        {instance.focus_broken_count > 0 && (
          <span className="px-1 text-xs text-muted-foreground">
            {t("focusBroken", { count: instance.focus_broken_count })}
          </span>
        )}
        {instance.event_id ? (
          <Link
            href="/calendar"
            className="ml-auto flex h-10 items-center gap-1.5 px-2.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            {t("oneOffEvent")}
          </Link>
        ) : (
          <Button type="button" variant="ghost" className="ml-auto h-10 gap-1.5" onClick={() => setDialog("edit")}>
            <Pencil className="size-4" aria-hidden="true" />
            {t("editThisDay")}
          </Button>
        )}
      </div>

      {dialog === "note" && <NoteDialog instance={instance} onClose={() => setDialog(null)} />}
      {dialog === "edit" && <EditDialog instance={instance} onClose={() => setDialog(null)} />}
    </li>
  );
}
