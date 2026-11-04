import { goalPercent } from "@/features/command/logic";
import { summarize, totalsByCategory } from "@/features/finance/logic";
import { getGameView } from "@/features/game/service";
import { asData, SYSTEM_PROMPT } from "@/features/oracle/context";
import { ProviderError, type AiProvider } from "@/features/oracle/provider";
import { AI_RATE_LIMIT_PER_MINUTE } from "@/config/oracle.config";
import type { ScheduleContext } from "@/features/schedule/generation";
import { weekStart as weekStartOf } from "@/features/schedule/logic";
import type { ActionResult, ScheduleErrorCode } from "@/features/schedule/types";
import { goalProgress, ledgerTotals, minutesByCategory, powerTrend, restCounts, weekRange, weekStreak } from "./logic";
import type { WeeklyAnswers } from "./types";

const OK: ActionResult = { ok: true };
const fail = (code: ScheduleErrorCode): ActionResult => ({ ok: false, code });
const TOP_SPENDING_CATEGORIES = 3;

/** Everything but money, so the Oracle can be handed it. It never sees or changes the Treasury. */
async function buildStats(ctx: ScheduleContext, weekStart: string) {
  const { weekEnd, dates } = weekRange(weekStart);
  const lastNeeded = weekEnd > ctx.today ? weekEnd : ctx.today;
  const [instances, ledger, summaries, restDays, game, goals, projects, tasks] = await Promise.all([
    ctx.repo.listInstances(weekStart, weekEnd),
    ctx.repo.listLedgerBetween(weekStart, lastNeeded),
    ctx.repo.listSummariesFrom(weekStart),
    ctx.repo.listRestDays(weekStart, weekEnd),
    getGameView(ctx),
    ctx.repo.listGoals(),
    ctx.repo.listProjects(),
    ctx.repo.listTasks(),
  ]);
  const active = goals
    .filter((goal) => goal.status === "active")
    .map((goal) => ({ id: goal.id, title: goal.title, percent: goalPercent(goal, projects, tasks) }));
  const snapshots = await ctx.repo.listSnapshots("goal", active.map((goal) => goal.id));
  const categories = minutesByCategory(instances);

  return {
    weekStart,
    weekEnd,
    isCurrentWeek: weekStart === weekStartOf(ctx.today),
    categories,
    planned: categories.reduce((sum, row) => sum + row.planned, 0),
    done: categories.reduce((sum, row) => sum + row.done, 0),
    ...ledgerTotals(ledger, weekStart, weekEnd),
    power: powerTrend(dates, ledger, game.power, ctx.today),
    streak: weekStreak(summaries, weekEnd, ctx.today, game.streakDays),
    ...restCounts(restDays),
    goals: goalProgress(active, snapshots, weekStart, weekEnd, ctx.today),
  };
}

export type WeekStats = Awaited<ReturnType<typeof buildStats>>;

async function spendingFor(ctx: ScheduleContext, weekStart: string) {
  const { weekEnd } = weekRange(weekStart);
  const [transactions, categories] = await Promise.all([
    ctx.repo.listTransactions(weekStart, weekEnd),
    ctx.repo.listFinCategories(),
  ]);
  return {
    summary: summarize(transactions),
    top: totalsByCategory(transactions, "expense").slice(0, TOP_SPENDING_CATEGORIES),
    categories,
  };
}

export async function getReviewView(ctx: ScheduleContext, week: string) {
  const weekStart = weekStartOf(week);
  const [stats, spending, oracleText, answers] = await Promise.all([
    buildStats(ctx, weekStart),
    spendingFor(ctx, weekStart),
    ctx.repo.getWeeklyReview(weekStart),
    ctx.repo.getWeeklyAnswers(weekStart),
  ]);
  return { stats, spending, oracleText, answers, hasNextWeek: weekStart < weekStartOf(ctx.today) };
}

export async function saveWeeklyAnswers(ctx: ScheduleContext, week: string, answers: WeeklyAnswers): Promise<ActionResult> {
  await ctx.repo.saveWeeklyAnswers(weekStartOf(week), answers);
  return OK;
}

/** Numbers and the owner's own answers only. Their words are marked as data, so they can't pose as instructions. */
function reviewPrompt(stats: WeekStats, answers: WeeklyAnswers, language: string): string {
  const categories = stats.categories.map((row) => `${row.category}: ${row.done} of ${row.planned} minutes`).join("; ");
  const power = stats.power.map((day) => `${day.date} ${day.power}`).join(", ");
  const goals = stats.goals
    .map((goal) => `${asData(goal.title)} ${goal.percent}%${goal.change === null ? "" : ` (${goal.change >= 0 ? "+" : ""}${goal.change})`}`)
    .join("; ");
  return [
    `Write the owner's review of the week ${stats.weekStart} to ${stats.weekEnd} in three to five short sentences of ${language}.`,
    "Say what stood out, what slipped, and one thing to do next week. Use only the facts below. Don't suggest numbers you weren't given.",
    `Minutes done of planned: ${categories || "nothing planned"}. Total ${stats.done} of ${stats.planned}.`,
    `XP gained ${stats.xpGained}, XP lost ${stats.xpLost}. Power at each day's end: ${power || "none"}. Streak ${stats.streak} days.`,
    `Rest Days used ${stats.restDays}, Shields used ${stats.shields}.`,
    "<data>",
    `Goals: ${goals || "none"}`,
    answers.worked ? `The owner says this worked: ${asData(answers.worked)}` : "",
    answers.didnt ? `The owner says this didn't: ${asData(answers.didnt)}` : "",
    answers.focus ? `The owner's focus for next week: ${asData(answers.focus)}` : "",
    "</data>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Has the Oracle write the week's review, replacing any earlier one. The owner's own answers are never touched. */
export async function generateWeeklyReview(
  ctx: ScheduleContext,
  provider: AiProvider | null,
  week: string
): Promise<ActionResult> {
  if (!provider) return fail("oracleUnavailable");
  if (!(await ctx.repo.bumpRateLimit(AI_RATE_LIMIT_PER_MINUTE, ctx.now ?? new Date()))) return fail("rateLimited");

  const weekStart = weekStartOf(week);
  const [stats, answers] = await Promise.all([buildStats(ctx, weekStart), ctx.repo.getWeeklyAnswers(weekStart)]);
  const language = ctx.locale === "zh-TW" ? "Traditional Chinese" : "English";
  try {
    const { text } = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: reviewPrompt(stats, answers, language) },
      ],
    });
    if (!text.trim()) return fail("oracleUnavailable");
    await ctx.repo.saveWeeklyReview(weekStart, text.trim());
    return OK;
  } catch (error) {
    if (error instanceof ProviderError) return fail(error.code);
    throw error;
  }
}
