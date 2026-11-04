"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, BellOff, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import {
  addPushDeviceAction,
  removePushDeviceAction,
  saveNotificationSettingsAction,
  sendTestPushAction,
} from "../actions";
import type { NotificationSettings as Settings } from "../types";

const TOGGLES = ["notify_weekly", "notify_block_start", "notify_open_blocks", "notify_low_power"] as const;

type DeviceState = "checking" | "unsupported" | "blocked" | "off" | "on";

/** The push service wants the key as raw bytes. It's written in a form safe for addresses. */
function keyToBytes(key: string): Uint8Array<ArrayBuffer> {
  const text = atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "="));
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

type InstallPrompt = Event & { prompt: () => Promise<void> };

function InstallGuide() {
  const t = useTranslations("notifications");
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  return (
    <details className="rounded-lg bg-surface-2 p-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">{t("installTitle")}</summary>
      <div className="flex flex-col gap-3 pt-2">
        {prompt && (
          <Button
            type="button"
            className="h-11 w-fit gap-1.5 px-4"
            onClick={() => {
              void prompt.prompt();
              setPrompt(null);
            }}
          >
            <Download className="size-4" aria-hidden="true" />
            {t("installNow")}
          </Button>
        )}
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
          <li>{t("installStep1")}</li>
          <li>{t("installStep2")}</li>
          <li>{t("installStep3")}</li>
          <li>{t("installStep4")}</li>
        </ol>
      </div>
    </details>
  );
}

export function NotificationSettings(props: { settings: Settings; publicKey: string | null; serverReady: boolean }) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const { pending, error, run } = useScheduleAction();
  const [settings, setSettings] = useState(props.settings);
  const [device, setDevice] = useState<DeviceState>("checking");
  const [testSent, setTestSent] = useState(false);
  const [deviceFailed, setDeviceFailed] = useState(false);
  const ready = props.serverReady && Boolean(props.publicKey);

  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<DeviceState> {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
      if (Notification.permission === "denied") return "blocked";
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      return subscription ? "on" : "off";
    }
    check()
      .then((state) => {
        if (!cancelled) setDevice(state);
      })
      .catch(() => {
        if (!cancelled) setDevice("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function saveToggle(key: (typeof TOGGLES)[number], value: boolean) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    run(() => saveNotificationSettingsAction(next));
  }

  async function turnOn() {
    setDeviceFailed(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const active = await navigator.serviceWorker.ready;
      const manager = active.pushManager ?? registration.pushManager;
      const subscription = await manager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(props.publicKey as string),
      });
      const { endpoint, keys } = subscription.toJSON();
      run(
        () => addPushDeviceAction({ endpoint, p256dh: keys?.p256dh, auth: keys?.auth }),
        () => setDevice("on")
      );
    } catch {
      setDeviceFailed(true);
    }
  }

  async function turnOff() {
    setDeviceFailed(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        run(() => removePushDeviceAction({ endpoint }));
      }
      setDevice("off");
    } catch {
      setDeviceFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("title")}</h2>

      {!ready && <p className="text-sm text-muted-foreground">{t("notReady")}</p>}
      {ready && device === "unsupported" && <p className="text-sm text-muted-foreground">{t("unsupported")}</p>}
      {ready && device === "blocked" && <p className="text-sm text-muted-foreground">{t("blocked")}</p>}

      {ready && (device === "off" || device === "on") && (
        <div className="flex flex-wrap gap-2">
          {device === "off" ? (
            <Button type="button" className="h-11 gap-1.5 px-4" disabled={pending} onClick={() => void turnOn()}>
              <Bell className="size-4" aria-hidden="true" />
              {t("turnOn")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" className="h-11 gap-1.5 px-4" disabled={pending} onClick={() => void turnOff()}>
                <BellOff className="size-4" aria-hidden="true" />
                {t("turnOff")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-4"
                disabled={pending}
                onClick={() => {
                  setTestSent(false);
                  run(() => sendTestPushAction({ locale }), () => setTestSent(true));
                }}
              >
                {t("sendTest")}
              </Button>
            </>
          )}
        </div>
      )}
      {testSent && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("testSent")}
        </p>
      )}
      {deviceFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("deviceFailed")}
        </p>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="pb-1 text-sm font-medium">{t("whichTitle")}</legend>
        {TOGGLES.map((key) => (
          <label key={key} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-crimson-500"
              checked={settings[key]}
              onChange={(event) => saveToggle(key, event.target.checked)}
            />
            {t(key)}
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <InstallGuide />
    </div>
  );
}
