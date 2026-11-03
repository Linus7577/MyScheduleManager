"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { FIELD_CLASS } from "@/features/schedule/components/meta";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { cn } from "@/lib/utils";
import { createHabitAction, deleteHabitAction, toggleCheckinAction, updateHabitAction } from "../actions";
import { checkinsThisWeek, habitStreak } from "../logic";
import type { Habit, HabitCheckin } from "../types";

const TARGETS = [1, 2, 3, 4, 5, 6, 7];

function HabitDialog({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const t = useTranslations("habits");
  const { pending, error, run } = useScheduleAction();
  const [title, setTitle] = useState(habit?.title ?? "");
  const [target, setTarget] = useState(habit?.target_per_week ?? 7);

  function save() {
    const fields = { title, target_per_week: target, active: habit?.active ?? true };
    run(() => (habit ? updateHabitAction({ id: habit.id, ...fields }) : createHabitAction(fields)), onClose);
  }

  return (
    <FormDialog open onClose={onClose} title={habit ? t("editHabit") : t("newHabit")} pending={pending} error={error} onSubmit={save}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="habit-title">{t("habitTitle")}</Label>
        <Input id="habit-title" required maxLength={120} className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="habit-target">{t("target")}</Label>
        <select id="habit-target" className={FIELD_CLASS} value={target} onChange={(e) => setTarget(Number(e.target.value))}>
          {TARGETS.map((value) => (
            <option key={value} value={value}>
              {value === 7 ? t("everyDay") : t("timesPerWeek", { count: value })}
            </option>
          ))}
        </select>
      </div>
    </FormDialog>
  );
}

/** Today's check-in, used on this page and in the dashboard widget. */
export function HabitToggle(props: { habit: Habit; today: string; done: boolean }) {
  const t = useTranslations("habits");
  const { pending, error, run } = useScheduleAction();
  const { habit, today, done } = props;

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        aria-pressed={done}
        disabled={pending}
        onClick={() => run(() => toggleCheckinAction({ habit_id: habit.id, date: today }))}
        className={cn("h-11 gap-1.5 px-3", done && "border-transparent bg-surface-2 text-ember-400 ring-2 ring-current")}
      >
        <Check className="size-4" aria-hidden="true" />
        {done ? t("doneToday") : t("checkIn")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Heatmap(props: { habit: Habit; weeks: string[][]; checkedDates: Set<string>; today: string }) {
  const t = useTranslations("habits");
  const format = useFormatter();
  const { run, pending, error } = useScheduleAction();
  const { habit, weeks, checkedDates, today } = props;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-[3px] overflow-x-auto" role="group" aria-label={t("heatmapLabel", { title: habit.title })}>
        {weeks.map((week) => (
          <div key={week[0]} className="flex flex-col gap-[3px]">
            {week.map((date) => {
              const checked = checkedDates.has(date);
              const future = date > today;
              const label = format.dateTime(new Date(`${date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
              return (
                <button
                  key={date}
                  type="button"
                  disabled={future || pending}
                  aria-pressed={checked}
                  aria-label={checked ? t("checkedOn", { date: label }) : t("notCheckedOn", { date: label })}
                  title={label}
                  onClick={() => run(() => toggleCheckinAction({ habit_id: habit.id, date }))}
                  className={cn(
                    "size-5 rounded-[4px] ring-1 ring-foreground/5",
                    checked ? "bg-ember-600" : "bg-surface-2",
                    future && "opacity-30",
                    date === today && "ring-2 ring-bone-300"
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function HabitsPage(props: { habits: Habit[]; checkins: HabitCheckin[]; weeks: string[][]; today: string }) {
  const t = useTranslations("habits");
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<{ habit: Habit | null } | null>(null);
  const { habits, checkins, weeks, today } = props;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button type="button" className="h-11 gap-1.5 px-3" onClick={() => setDialog({ habit: null })}>
          <Plus className="size-4" aria-hidden="true" />
          {t("newHabit")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {habits.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-10 text-center text-base ring-1 ring-foreground/10">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {habits.map((habit) => {
            const own = checkins.filter((checkin) => checkin.habit_id === habit.id);
            const checkedDates = new Set(own.map((checkin) => checkin.date));
            const streak = habitStreak(habit, checkins, today);
            return (
              <li key={habit.id} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-sans text-base font-medium break-words">{habit.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {habit.target_per_week === 7
                        ? t("everyDay")
                        : t("weekProgress", {
                            done: checkinsThisWeek(habit.id, checkins, today),
                            target: habit.target_per_week,
                          })}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" className="size-10" aria-label={t("editHabitNamed", { title: habit.title })} onClick={() => setDialog({ habit })}>
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    className="size-10 text-destructive"
                    aria-label={t("deleteHabitNamed", { title: habit.title })}
                    onClick={() => {
                      if (window.confirm(t("deleteHabitConfirm", { title: habit.title }))) run(() => deleteHabitAction({ id: habit.id }));
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <HabitToggle habit={habit} today={today} done={checkedDates.has(today)} />
                  <p className="flex items-center gap-1.5 text-sm">
                    <Flame className="size-4 text-ember-400" aria-hidden="true" />
                    {streak.unit === "days" ? t("streakDays", { count: streak.value }) : t("streakWeeks", { count: streak.value })}
                  </p>
                </div>
                <Heatmap habit={habit} weeks={weeks} checkedDates={checkedDates} today={today} />
              </li>
            );
          })}
        </ul>
      )}

      {dialog && <HabitDialog habit={dialog.habit} onClose={() => setDialog(null)} />}
    </div>
  );
}
