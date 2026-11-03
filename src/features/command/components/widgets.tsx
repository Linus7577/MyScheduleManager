import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarDays, Flame, ListTodo, Lock } from "lucide-react";
import { getGameView } from "@/features/game/service";
import { STATUS_META } from "@/features/schedule/components/meta";
import type { ScheduleContext } from "@/features/schedule/generation";
import type { BlockInstance } from "@/features/schedule/types";
import { cn } from "@/lib/utils";
import { trackPercent } from "../logic";
import { getGoalsView, getHabitsView, getUpcoming, getWeeklyStats } from "../service";
import { WeeklyChart } from "./chart-loaders";
import { HabitToggle } from "./habits";
import { ProgressBar } from "./progress-bar";

function WidgetLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mt-2 flex min-h-10 w-fit items-center text-sm text-crimson-400 underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

function BlockLine({ block }: { block: BlockInstance }) {
  const Icon = STATUS_META[block.status].icon;
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <Icon className={cn("size-4 shrink-0", STATUS_META[block.status].colorClass)} aria-hidden="true" />
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {block.start_time}–{block.end_time}
      </span>
      <span className="min-w-0 flex-1 truncate">{block.title}</span>
    </li>
  );
}

export async function GoalsWidget({ ctx }: { ctx: ScheduleContext }) {
  const t = await getTranslations("dashboard");
  const goals = (await getGoalsView(ctx)).filter((goal) => goal.status === "active");

  return (
    <>
      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noGoals")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((goal) => (
            <li key={goal.id}>
              <Link href={`/goals/${goal.id}`} className="block rounded-lg hover:bg-surface-2">
                <span className="text-sm break-words">{goal.title}</span>
                <ProgressBar percent={goal.percent} label={t("progressOf", { title: goal.title })} className="mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <WidgetLink href="/goals">{t("openGoals")}</WidgetLink>
    </>
  );
}

export async function TodayWidget({ ctx }: { ctx: ScheduleContext }) {
  const t = await getTranslations("dashboard");
  const blocks = (await ctx.repo.listInstances(ctx.today, ctx.today)).filter((block) => !block.is_cancelled);

  return (
    <>
      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noBlocksToday")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {blocks.map((block) => (
            <BlockLine key={block.id} block={block} />
          ))}
        </ul>
      )}
      <WidgetLink href="/loop">{t("openLoop")}</WidgetLink>
    </>
  );
}

export async function LearningWidget({ ctx }: { ctx: ScheduleContext }) {
  const t = await getTranslations("dashboard");
  const [tracks, units] = await Promise.all([ctx.repo.listTracks(), ctx.repo.listUnits()]);

  return (
    <>
      {tracks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noTracks")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tracks.map((track) => (
            <li key={track.id}>
              <Link href={`/learning/${track.id}`} className="block rounded-lg hover:bg-surface-2">
                <span className="text-sm break-words">{track.title}</span>
                <ProgressBar percent={trackPercent(track.id, units)} label={t("progressOf", { title: track.title })} className="mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <WidgetLink href="/learning">{t("openLearning")}</WidgetLink>
    </>
  );
}

export async function HabitsWidget({ ctx }: { ctx: ScheduleContext }) {
  const t = await getTranslations("dashboard");
  const [view, game] = await Promise.all([getHabitsView(ctx), getGameView(ctx)]);
  const active = view.habits.filter((habit) => habit.active);

  return (
    <>
      <p className="flex items-center gap-1.5 text-sm">
        <Flame className="size-4 text-ember-400" aria-hidden="true" />
        {t("loopStreak", { count: game.streakDays })}
      </p>
      {active.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("noHabits")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {active.map((habit) => (
            <li key={habit.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 break-words">{habit.title}</span>
              <HabitToggle
                habit={habit}
                today={ctx.today}
                done={view.checkins.some((checkin) => checkin.habit_id === habit.id && checkin.date === ctx.today)}
              />
            </li>
          ))}
        </ul>
      )}
      <WidgetLink href="/habits">{t("openHabits")}</WidgetLink>
    </>
  );
}

export async function EventsWidget({ ctx }: { ctx: ScheduleContext }) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const { events, tasks } = await getUpcoming(ctx);
  const dateLabel = (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" });

  return (
    <>
      {events.length === 0 && tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nothingUpcoming")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {events.map((event) => (
            <li key={event.id} className="flex items-center gap-2 py-1.5 text-sm">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="shrink-0 text-xs text-muted-foreground">{dateLabel(event.start_date)}</span>
              <span className="min-w-0 flex-1 truncate">{event.title}</span>
            </li>
          ))}
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 py-1.5 text-sm">
              <ListTodo className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="shrink-0 text-xs text-muted-foreground">{dateLabel(task.due_date as string)}</span>
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
            </li>
          ))}
        </ul>
      )}
      <WidgetLink href="/calendar">{t("openCalendar")}</WidgetLink>
    </>
  );
}

export async function WeeklyWidget({ ctx }: { ctx: ScheduleContext }) {
  return <WeeklyChart data={await getWeeklyStats(ctx)} />;
}

export async function SealedWidget({ phase }: { phase: number }) {
  const t = await getTranslations("sealed");
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Lock className="size-3.5" aria-hidden="true" />
      {t("note", { phase })}
    </p>
  );
}
