import { LOW_POWER_ALERT } from "@/config/game.config";
import type { BlockInstance } from "@/features/schedule/types";
import type { NotificationSettings, NotifyKind } from "./types";

/** The timer runs every five minutes, so this catches a block even if one run comes late. Sending twice is prevented elsewhere. */
const BLOCK_START_WINDOW_MINUTES = 10;
const OPEN_BLOCKS_FROM = "23:30";
/** Low Power can wait for a reasonable hour. A block starting or a day ending can't. */
const LOW_POWER_FROM = "08:00";
const LOW_POWER_UNTIL = "22:00";
const WEEKLY_REVIEW_DAYS = 30;

export const NOTIFICATION_LOG_DAYS = WEEKLY_REVIEW_DAYS;

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export type DueNotification =
  | { kind: Extract<NotifyKind, "block_start">; key: string; title: string }
  | { kind: Extract<NotifyKind, "open_blocks">; key: string; count: number }
  | { kind: Extract<NotifyKind, "low_power">; key: string; power: number };

export function dueNotifications(input: {
  settings: NotificationSettings;
  today: string;
  /** The owner's clock now, as HH:mm. */
  time: string;
  blocks: BlockInstance[];
  power: number;
}): DueNotification[] {
  const { settings, today, time, power } = input;
  const open = input.blocks.filter((block) => block.date === today && !block.is_cancelled && block.status === "planned");
  const due: DueNotification[] = [];

  if (settings.notify_block_start) {
    const now = toMinutes(time);
    for (const block of open) {
      const late = now - toMinutes(block.start_time);
      if (late >= 0 && late < BLOCK_START_WINDOW_MINUTES) due.push({ kind: "block_start", key: block.id, title: block.title });
    }
  }
  if (settings.notify_open_blocks && time >= OPEN_BLOCKS_FROM && open.length > 0) {
    due.push({ kind: "open_blocks", key: today, count: open.length });
  }
  if (settings.notify_low_power && power < LOW_POWER_ALERT && time >= LOW_POWER_FROM && time < LOW_POWER_UNTIL) {
    due.push({ kind: "low_power", key: today, power: Math.floor(power) });
  }
  return due;
}

/** Only the big push services. The server sends to this address, so it can't be left open to any address at all. */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}
