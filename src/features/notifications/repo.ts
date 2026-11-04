import type { NotificationSettings, NotifyKind, PushDevice } from "./types";

export interface NotificationRepo {
  getNotificationSettings(): Promise<NotificationSettings>;
  saveNotificationSettings(settings: NotificationSettings): Promise<void>;

  listPushDevices(): Promise<PushDevice[]>;
  savePushDevice(device: PushDevice): Promise<void>;
  deletePushDevice(endpoint: string): Promise<void>;

  /** Records that this was sent. False if it had been already, so a timer that runs twice can't send it twice. */
  claimNotification(kind: NotifyKind, key: string): Promise<boolean>;
  pruneNotificationLog(before: Date): Promise<void>;
}
