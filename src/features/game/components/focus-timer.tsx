"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleCheck, CircleDotDashed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logInstanceAction } from "@/features/schedule/actions";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { recordFocusBrokenAction } from "../actions";
import { formatCountdown } from "../doom";
import { DoomRings } from "./doom-rings";

const TOAST_MS = 5000;

function storageKey(id: string) {
  return `focus-started-${id}`;
}

function readStart(id: string): number | null {
  try {
    const saved = window.localStorage.getItem(storageKey(id));
    return saved ? Number(saved) : null;
  } catch {
    return null;
  }
}

function writeStart(id: string, value: number | null) {
  try {
    if (value === null) window.localStorage.removeItem(storageKey(id));
    else window.localStorage.setItem(storageKey(id), String(value));
  } catch {
    // Private windows can refuse storage. The timer still runs, it just won't survive a reload.
  }
}

function subscribeToSeconds(notify: () => void) {
  const timer = setInterval(notify, 1000);
  return () => clearInterval(timer);
}

/** Keeps the phone's screen on while focusing, on browsers that support it. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (cancelled) void acquired.release();
        else lock = acquired;
      } catch {
        // Refused, for example on low battery. Focus mode works without it.
      }
    }

    function onVisibility() {
      if (!document.hidden) void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, [active]);
}

export function FocusTimer(props: { id: string; title: string; minutes: number; logNote: string }) {
  const t = useTranslations("focus");
  const statuses = useTranslations("instanceStatus");
  const router = useRouter();
  const { pending, error, run } = useScheduleAction();
  const totalSeconds = props.minutes * 60;

  const [startedAt, setStartedAt] = useState<number | null>(() => readStart(props.id));
  const [endedEarly, setEndedEarly] = useState(false);
  const [leftWarning, setLeftWarning] = useState(false);
  const now = useSyncExternalStore(subscribeToSeconds, () => Math.floor(Date.now() / 1000) * 1000, () => 0);

  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const remaining = Math.max(0, totalSeconds - elapsed);
  const isFinished = startedAt !== null && (remaining === 0 || endedEarly);
  const isRunning = startedAt !== null && !isFinished;

  useWakeLock(isRunning);

  const wasHidden = useRef(false);
  useEffect(() => {
    if (!isRunning) return;
    function onVisibility() {
      if (document.hidden) {
        wasHidden.current = true;
        return;
      }
      if (!wasHidden.current) return;
      wasHidden.current = false;
      // No XP or Power penalty, by the owner's choice. It's only counted and shown.
      void recordFocusBrokenAction({ id: props.id });
      setLeftWarning(true);
      setTimeout(() => setLeftWarning(false), TOAST_MS);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isRunning, props.id]);

  function begin() {
    const start = Date.now();
    writeStart(props.id, start);
    setStartedAt(start);
  }

  function finish(status: "done" | "partial") {
    run(
      () => logInstanceAction({ id: props.id, status, log_note: props.logNote }),
      () => {
        writeStart(props.id, null);
        router.push("/loop");
      }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-bg p-4 eclipse-sky">
      <Link
        href="/loop"
        aria-label={t("leave")}
        className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2"
      >
        <X className="size-5" aria-hidden="true" />
      </Link>

      {leftWarning && (
        <p role="alert" className="absolute top-16 mx-4 rounded-lg bg-crimson-950 px-4 py-2 text-center text-sm text-crimson-100 ring-1 ring-crimson-700">
          {t("leftWarning")}
        </p>
      )}

      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <h1 className="max-w-full text-center text-xl font-semibold break-words">{props.title}</h1>

        <DoomRings currentHour={-1} blockProgress={totalSeconds ? elapsed / totalSeconds : 0} allDone={false}>
          <p role="timer" aria-label={t("timeLeft")} className="font-mono text-4xl font-semibold tabular-nums md:text-5xl">
            {formatCountdown(startedAt === null ? totalSeconds : remaining)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("timeLeft")}</p>
        </DoomRings>

        {startedAt === null && (
          <Button type="button" className="h-12 w-full max-w-xs text-base" onClick={begin}>
            {t("begin")}
          </Button>
        )}

        {isRunning && (
          <Button type="button" variant="outline" className="h-11 px-5" onClick={() => setEndedEarly(true)}>
            {t("endEarly")}
          </Button>
        )}

        {isFinished && (
          <div className="flex w-full max-w-xs flex-col gap-2 text-center">
            <p className="text-sm text-muted-foreground">{t("howDidItGo")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" disabled={pending} className="h-12 gap-1.5" onClick={() => finish("done")}>
                <CircleCheck className="size-4" aria-hidden="true" />
                {statuses("done")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                className="h-12 gap-1.5"
                onClick={() => finish("partial")}
              >
                <CircleDotDashed className="size-4" aria-hidden="true" />
                {statuses("partial")}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
