import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, isLocale } from "@/config/app.config";
import { getGameView } from "@/features/game/service";
import { generateWeeklyReview } from "@/features/review/service";
import type { AiProvider } from "@/features/oracle/provider";
import type { ScheduleContext } from "@/features/schedule/generation";
import { weekStart } from "@/features/schedule/logic";
import type { ActionResult } from "@/features/schedule/types";
import { dueNotifications, NOTIFICATION_LOG_DAYS, type DueNotification } from "./logic";
import type { NotificationSettings, PushDevice, PushMessage } from "./types";

const OK: ActionResult = { ok: true };
const DAY_MS = 86_400_000;

export type SendPush = (message: PushMessage) => Promise<number>;

async function translator(locale: string | undefined) {
  const language = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const messages = (await import(`../../../messages/${language}.json`)).default;
  return createTranslator({ locale: language, messages, namespace: "notifications" });
}

export async function getNotificationView(ctx: ScheduleContext) {
  const [settings, devices] = await Promise.all([ctx.repo.getNotificationSettings(), ctx.repo.listPushDevices()]);
  return { settings, deviceCount: devices.length };
}

export async function saveNotificationSettings(ctx: ScheduleContext, settings: NotificationSettings): Promise<ActionResult> {
  await ctx.repo.saveNotificationSettings(settings);
  return OK;
}

export async function addPushDevice(ctx: ScheduleContext, device: PushDevice): Promise<ActionResult> {
  await ctx.repo.savePushDevice(device);
  return OK;
}

export async function removePushDevice(ctx: ScheduleContext, endpoint: string): Promise<ActionResult> {
  await ctx.repo.deletePushDevice(endpoint);
  return OK;
}

export async function sendTestPush(ctx: ScheduleContext, send: SendPush): Promise<ActionResult> {
  const t = await translator(ctx.locale);
  const sent = await send({ title: t("testTitle"), body: t("testBody"), url: "/settings", tag: "test" });
  return sent > 0 ? OK : { ok: false, code: "pushNotSent" };
}

function messageFor(due: DueNotification, t: Awaited<ReturnType<typeof translator>>): PushMessage {
  switch (due.kind) {
    case "block_start":
      return { title: t("blockStartTitle"), body: due.title, url: "/loop", tag: `block-${due.key}` };
    case "open_blocks":
      return { title: t("openBlocksTitle"), body: t("openBlocksBody", { count: due.count }), url: "/loop", tag: "open-blocks" };
    case "low_power":
      return { title: t("lowPowerTitle"), body: t("lowPowerBody", { power: due.power }), url: "/", tag: "low-power" };
  }
}

/** What the five-minute timer runs. Does as little as it can when the optional notifications are off. */
export async function runNotificationTick(ctx: ScheduleContext & { wallClock: string }, send: SendPush): Promise<number> {
  const settings = await ctx.repo.getNotificationSettings();
  if (!settings.notify_block_start && !settings.notify_open_blocks && !settings.notify_low_power) return 0;
  if ((await ctx.repo.listPushDevices()).length === 0) return 0;

  const [blocks, game, t] = await Promise.all([ctx.repo.listInstances(ctx.today, ctx.today), getGameView(ctx), translator(ctx.locale)]);
  const due = dueNotifications({ settings, today: ctx.today, time: ctx.wallClock.slice(11, 16), blocks, power: game.power });

  let sent = 0;
  for (const notification of due) {
    if (await ctx.repo.claimNotification(notification.kind, notification.key)) {
      sent += await send(messageFor(notification, t));
    }
  }
  return sent;
}

/** What Sunday night's job runs: the Oracle's review first, then the push. Either can fail without stopping the other. */
export async function runWeeklyRitual(ctx: ScheduleContext, provider: AiProvider | null, send: SendPush) {
  const week = weekStart(ctx.today);
  let written = Boolean(await ctx.repo.getWeeklyReview(week));
  if (!written) {
    try {
      written = (await generateWeeklyReview(ctx, provider, week)).ok;
    } catch {
      written = false;
    }
  }

  await ctx.repo.pruneNotificationLog(new Date((ctx.now ?? new Date()).getTime() - NOTIFICATION_LOG_DAYS * DAY_MS));

  const settings = await ctx.repo.getNotificationSettings();
  let sent = 0;
  if (settings.notify_weekly && (await ctx.repo.claimNotification("weekly", week))) {
    const t = await translator(ctx.locale);
    sent = await send({ title: t("weeklyTitle"), body: t("weeklyBody"), url: "/review", tag: `weekly-${week}` });
  }
  return { written, sent };
}
