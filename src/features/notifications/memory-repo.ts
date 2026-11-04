import type { NotificationRepo } from "./repo";
import { DEFAULT_NOTIFICATIONS, type NotificationSettings, type PushDevice } from "./types";

export type NotificationStore = {
  settings: NotificationSettings;
  devices: PushDevice[];
  sent: Map<string, Date>;
};

export const emptyNotificationStore = (): NotificationStore => ({
  settings: { ...DEFAULT_NOTIFICATIONS },
  devices: [],
  sent: new Map(),
});

export function createNotificationMemoryRepo(store: NotificationStore): NotificationRepo {
  return {
    async getNotificationSettings() {
      return store.settings;
    },
    async saveNotificationSettings(settings) {
      store.settings = settings;
    },
    async listPushDevices() {
      return store.devices;
    },
    async savePushDevice(device) {
      store.devices = [...store.devices.filter((existing) => existing.endpoint !== device.endpoint), device];
    },
    async deletePushDevice(endpoint) {
      store.devices = store.devices.filter((device) => device.endpoint !== endpoint);
    },
    async claimNotification(kind, key) {
      const id = `${kind}:${key}`;
      if (store.sent.has(id)) return false;
      store.sent.set(id, new Date());
      return true;
    },
    async pruneNotificationLog(before) {
      for (const [id, at] of store.sent) if (at < before) store.sent.delete(id);
    },
  };
}
