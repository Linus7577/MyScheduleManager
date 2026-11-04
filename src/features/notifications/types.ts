export type NotifyKind = "weekly" | "block_start" | "open_blocks" | "low_power";

export type NotificationSettings = {
  notify_weekly: boolean;
  notify_block_start: boolean;
  notify_open_blocks: boolean;
  notify_low_power: boolean;
};

/** Only the Sunday review is on until the owner chooses otherwise. */
export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  notify_weekly: true,
  notify_block_start: false,
  notify_open_blocks: false,
  notify_low_power: false,
};

export type PushDevice = { endpoint: string; p256dh: string; auth: string };

export type PushMessage = { title: string; body: string; url: string; tag: string };
