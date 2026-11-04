"use server";

import { z } from "zod";
import { runAction } from "@/features/schedule/run-action";
import { isPushEndpoint } from "./logic";
import { sendPush } from "./push";
import { addPushDevice, removePushDevice, saveNotificationSettings, sendTestPush } from "./service";

const settingsSchema = z.strictObject({
  notify_weekly: z.boolean(),
  notify_block_start: z.boolean(),
  notify_open_blocks: z.boolean(),
  notify_low_power: z.boolean(),
});

const endpointSchema = z.string().max(1000).refine(isPushEndpoint);

const deviceSchema = z.strictObject({
  endpoint: endpointSchema,
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
});

const localeSchema = z.strictObject({ locale: z.enum(["en", "zh-TW"]) });

export async function saveNotificationSettingsAction(input: unknown) {
  return runAction(settingsSchema, input, (ctx, data) => saveNotificationSettings(ctx, data));
}

export async function addPushDeviceAction(input: unknown) {
  return runAction(deviceSchema, input, (ctx, data) => addPushDevice(ctx, data));
}

export async function removePushDeviceAction(input: unknown) {
  return runAction(z.strictObject({ endpoint: endpointSchema }), input, (ctx, data) => removePushDevice(ctx, data.endpoint));
}

export async function sendTestPushAction(input: unknown) {
  return runAction(localeSchema, input, (ctx, data) =>
    sendTestPush({ ...ctx, locale: data.locale }, (message) => sendPush(ctx.repo, message))
  );
}
