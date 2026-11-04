"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createEventAction, deleteEventAction, skipOccurrenceAction, updateEventAction } from "../actions";
import { earnsXp } from "../logic";
import type { CalendarEvent, EventFields } from "../types";
import { CategorySelect } from "./block-fields";
import { FIELD_CLASS } from "./meta";
import { FormDialog } from "./form-dialog";
import { useScheduleAction } from "./use-action";

export type EventDraft = { event: CalendarEvent | null; date: string; startTime: string | null };

function addHour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${String(Math.min(hours + 1, 23)).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const REPEAT_PRESETS = { daily: "FREQ=DAILY", weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY" } as const;
type RepeatChoice = "none" | keyof typeof REPEAT_PRESETS | "custom";

function repeatChoice(rule: string | null | undefined): RepeatChoice {
  if (!rule) return "none";
  const preset = Object.entries(REPEAT_PRESETS).find(([, value]) => value === rule);
  return preset ? (preset[0] as RepeatChoice) : "custom";
}

function initialValues({ event, date, startTime }: EventDraft): EventFields {
  if (event) {
    const { title, notes, category, all_day, start_date, end_date, start_time, end_time, rrule } = event;
    return { title, notes, category, all_day, start_date, end_date, start_time, end_time, rrule };
  }
  const start = startTime ?? "09:00";
  return {
    title: "",
    notes: "",
    category: "other",
    all_day: false,
    start_date: date,
    end_date: date,
    start_time: start,
    end_time: addHour(start),
    rrule: null,
  };
}

export function EventDialog(props: { draft: EventDraft; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("calendar");
  const { pending, error, run } = useScheduleAction();
  const [values, setValues] = useState<EventFields>(initialValues(props.draft));
  const [repeat, setRepeat] = useState<RepeatChoice>(repeatChoice(props.draft.event?.rrule));
  const { event, date } = props.draft;

  const productive = earnsXp(values);

  function update(patch: Partial<EventFields>) {
    const next = { ...values, ...patch };
    // An event that earns XP counts like a block, so it must be timed and on one date.
    if (earnsXp(next)) {
      next.end_date = next.start_date;
      if (next.all_day) {
        next.all_day = false;
        next.start_time = "09:00";
        next.end_time = "10:00";
      }
    }
    if (next.end_date < next.start_date) next.end_date = next.start_date;
    setValues(next);
  }

  function setAllDay(allDay: boolean) {
    update(
      allDay
        ? { all_day: true, start_time: null, end_time: null }
        : { all_day: false, start_time: "09:00", end_time: "10:00" }
    );
  }

  function save() {
    run(() => (event ? updateEventAction({ id: event.id, ...values }) : createEventAction(values)), props.onSaved);
  }

  function chooseRepeat(choice: RepeatChoice) {
    setRepeat(choice);
    if (choice === "custom") update({ rrule: values.rrule ?? REPEAT_PRESETS.weekly });
    else update({ rrule: choice === "none" ? null : REPEAT_PRESETS[choice] });
  }

  function remove() {
    if (!event) return;
    const question = event.rrule ? t("deleteAllConfirm", { title: event.title }) : t("deleteConfirm", { title: event.title });
    if (!window.confirm(question)) return;
    run(() => deleteEventAction({ id: event.id }), props.onSaved);
  }

  function removeOne() {
    if (!event || !window.confirm(t("deleteOneConfirm", { title: event.title, date }))) return;
    run(() => skipOccurrenceAction({ id: event.id, date }), props.onSaved);
  }

  return (
    <FormDialog
      open
      onClose={props.onClose}
      title={event ? t("editEvent") : t("newEvent")}
      pending={pending}
      error={error}
      onSubmit={save}
      extraAction={
        event ? (
          <>
            {event.rrule && (
              <Button type="button" variant="ghost" className="h-11 px-2 text-destructive" onClick={removeOne}>
                {t("deleteOne")}
              </Button>
            )}
            <Button type="button" variant="ghost" className="h-11 px-2 text-destructive" onClick={remove}>
              {event.rrule ? t("deleteAll") : t("delete")}
            </Button>
          </>
        ) : undefined
      }
    >
      {event?.rrule && <p className="text-xs text-muted-foreground">{t("repeatEditHint")}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-title">{t("eventTitle")}</Label>
        <Input
          id="event-title"
          required
          maxLength={120}
          className="h-11"
          value={values.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-category">{t("category")}</Label>
        <CategorySelect id="event-category" value={values.category} onChange={(category) => update({ category })} />
        <p className="text-xs text-muted-foreground">
          {values.rrule ? t("repeatHint") : productive ? t("productiveHint") : t("plainHint")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-repeat">{t("repeat")}</Label>
        <select
          id="event-repeat"
          className={FIELD_CLASS}
          value={repeat}
          onChange={(e) => chooseRepeat(e.target.value as RepeatChoice)}
        >
          <option value="none">{t("repeatNone")}</option>
          <option value="daily">{t("repeatDaily")}</option>
          <option value="weekly">{t("repeatWeekly")}</option>
          <option value="monthly">{t("repeatMonthly")}</option>
          <option value="custom">{t("repeatCustom")}</option>
        </select>
      </div>

      {repeat === "custom" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="event-rule">{t("repeatRule")}</Label>
          <Input
            id="event-rule"
            required
            maxLength={300}
            dir="ltr"
            className="h-11 font-mono text-xs"
            value={values.rrule ?? ""}
            onChange={(e) => update({ rrule: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">{t("repeatRuleHint")}</p>
        </div>
      )}

      {!productive && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-crimson-500"
            checked={values.all_day}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          {t("allDay")}
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="event-start-date">{productive ? t("date") : t("startDate")}</Label>
          <Input
            id="event-start-date"
            type="date"
            required
            className="h-11"
            value={values.start_date}
            onChange={(e) => update({ start_date: e.target.value })}
          />
        </div>
        {!productive && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-end-date">{t("endDate")}</Label>
            <Input
              id="event-end-date"
              type="date"
              required
              min={values.start_date}
              className="h-11"
              value={values.end_date}
              onChange={(e) => update({ end_date: e.target.value })}
            />
          </div>
        )}
      </div>

      {!values.all_day && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-start-time">{t("startTime")}</Label>
            <Input
              id="event-start-time"
              type="time"
              required
              className="h-11"
              value={values.start_time ?? ""}
              onChange={(e) => update({ start_time: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-end-time">{t("endTime")}</Label>
            <Input
              id="event-end-time"
              type="time"
              required
              className="h-11"
              value={values.end_time ?? ""}
              onChange={(e) => update({ end_time: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-notes">{t("notes")}</Label>
        <Textarea
          id="event-notes"
          maxLength={2000}
          rows={2}
          value={values.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </div>
    </FormDialog>
  );
}
