import "server-only";
import webpush from "web-push";
import type { NotificationRepo } from "./repo";
import type { PushMessage } from "./types";

/** A day: a review or reminder older than this has no use. */
const TTL_SECONDS = 86_400;
const GONE_STATUS_CODES = [404, 410];

function vapidDetails() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  // Push services ask for a way to identify the sender. The site's own address is enough, and shares no email.
  const site = process.env.VAPID_SUBJECT ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!publicKey || !privateKey || !site) return null;
  return { subject: site.includes(":") ? site : `https://${site}`, publicKey, privateKey };
}

export function isPushConfigured(): boolean {
  return vapidDetails() !== null;
}

/** Sends to every device the owner turned this on for. A device the push service says is gone is forgotten. */
export async function sendPush(repo: NotificationRepo, message: PushMessage): Promise<number> {
  const vapid = vapidDetails();
  if (!vapid) return 0;
  const devices = await repo.listPushDevices();
  const results = await Promise.allSettled(
    devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify(message),
          { vapidDetails: vapid, TTL: TTL_SECONDS }
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status && GONE_STATUS_CODES.includes(status)) await repo.deletePushDevice(device.endpoint);
        throw error;
      }
    })
  );
  return results.filter((result) => result.status === "fulfilled").length;
}
