import { getFormatter, getTranslations } from "next-intl/server";
import { Dashboard } from "@/features/command/components/dashboard";
import { TodayTimeline } from "@/features/command/components/today-timeline";
import {
  EventsWidget,
  GoalsWidget,
  HabitsWidget,
  LearningWidget,
  TodayWidget,
  WeeklyWidget,
} from "@/features/command/components/widgets";
import { getDashboardLayouts } from "@/features/command/service";
import { BudgetBanner } from "@/features/finance/components/budget-alerts";
import { PortfolioWidget, SpendingWidget } from "@/features/finance/components/widgets";
import { ensureFinanceReady, getSpendingSummary } from "@/features/finance/service";
import { HomeLobby } from "@/features/game/components/lobby";
import { moodFor, nextBlock } from "@/features/game/lines";
import { SuggestionWidget } from "@/features/oracle/components/suggestion-widget";
import { getGameView } from "@/features/game/service";
import { getScheduleContext } from "@/features/schedule/context";
import { ensureLoopReady } from "@/features/schedule/service";
import { getMotionLevel } from "@/features/settings/queries";

export default async function HomePage() {
  const t = await getTranslations("home");
  const tiers = await getTranslations("tiers");
  const powerStates = await getTranslations("powerStates");
  const dashboard = await getTranslations("dashboard");
  const templates = await getTranslations("templates");
  const format = await getFormatter();
  const ctx = await getScheduleContext();

  await ensureLoopReady(ctx, [templates("seedSemester"), templates("seedExam"), templates("seedHoliday")]);
  await ensureFinanceReady(ctx);

  const [game, motion, layouts, instances, suggestion, spending] = await Promise.all([
    getGameView(ctx),
    getMotionLevel(),
    getDashboardLayouts(ctx),
    ctx.repo.listInstances(ctx.today, ctx.today),
    ctx.repo.getSuggestion(ctx.today),
    getSpendingSummary(ctx),
  ]);
  const blocks = instances.filter((block) => !block.is_cancelled);
  const next = nextBlock(blocks, (ctx.wallClock ?? "").slice(11, 16));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t("title")}</h1>

      <HomeLobby
        tier={game.tier}
        tierName={tiers(String(game.tier))}
        levelLine={t("levelLine", { level: game.level, state: powerStates(game.powerState) })}
        streakDays={game.streakDays}
        powerState={game.powerState}
        armorFailing={game.armorFailing}
        mood={moodFor({
          powerState: game.powerState,
          streakDays: game.streakDays,
          blocksToday: blocks.length,
          blocksLeft: blocks.filter((block) => block.status === "planned").length,
        })}
        today={ctx.today}
        next={next && { title: next.title, start_time: next.start_time, end_time: next.end_time }}
        motion={motion}
      />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <section className="flex flex-col items-center gap-2 rounded-xl bg-card p-4 text-center ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">
          {t("today")}:{" "}
          <time dateTime={ctx.today} className="text-foreground">
            {format.dateTime(new Date(`${ctx.today}T00:00:00Z`), { dateStyle: "full", timeZone: "UTC" })}
          </time>
        </p>
        <TodayTimeline blocks={blocks} />
      </section>

      <BudgetBanner alerts={spending.alerts} categories={spending.categories} />

      <Dashboard
        layouts={layouts}
        titles={{
          goals: dashboard("widgets.goals"),
          today: dashboard("widgets.today"),
          learning: dashboard("widgets.learning"),
          habits: dashboard("widgets.habits"),
          spending: dashboard("widgets.spending"),
          portfolio: dashboard("widgets.portfolio"),
          oracle: dashboard("widgets.oracle"),
          events: dashboard("widgets.events"),
          weekly: dashboard("widgets.weekly"),
        }}
        widgets={{
          goals: <GoalsWidget ctx={ctx} />,
          today: <TodayWidget ctx={ctx} />,
          learning: <LearningWidget ctx={ctx} />,
          habits: <HabitsWidget ctx={ctx} />,
          spending: <SpendingWidget ctx={ctx} />,
          portfolio: <PortfolioWidget ctx={ctx} />,
          oracle: <SuggestionWidget suggestion={suggestion} />,
          events: <EventsWidget ctx={ctx} />,
          weekly: <WeeklyWidget ctx={ctx} />,
        }}
      />
      </div>
    </div>
  );
}
