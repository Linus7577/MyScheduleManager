"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CloudOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logInstanceAction } from "@/features/schedule/actions";
import { readQueue, removeFromQueue } from "@/features/schedule/offline-queue";

const SAVED_THIS_VISIT = "loop-saved-for-offline";

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Starts the service worker, saves today's Loop for offline, and sends waiting check-offs once back online. */
export function OfflineSync(props: { serviceWorker: boolean }) {
  const t = useTranslations("offline");
  const errors = useTranslations("errors");
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [failures, setFailures] = useState<string[]>([]);
  const sending = useRef(false);

  useEffect(() => {
    async function sendWaiting() {
      if (sending.current || !navigator.onLine) return;
      sending.current = true;
      let sent = false;
      try {
        for (const item of readQueue()) {
          let result;
          try {
            result = await logInstanceAction({ id: item.id, status: item.status, log_note: item.log_note });
          } catch {
            // Still no real connection. It stays in the queue for next time.
            break;
          }
          removeFromQueue(item.id);
          sent = true;
          if (!result.ok) {
            const reason = errors(result.code);
            setFailures((current) => [...current, t("syncFailed", { title: item.title, reason })]);
          }
        }
      } finally {
        sending.current = false;
      }
      if (sent) router.refresh();
    }

    function onChange() {
      setOnline(navigator.onLine);
      void sendWaiting();
    }

    onChange();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, [errors, router, t]);

  useEffect(() => {
    if (!props.serviceWorker || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (cancelled || !isOnline()) return;
        // Once a visit is enough, since the Loop page saves itself as well whenever it's opened.
        try {
          if (window.sessionStorage.getItem(SAVED_THIS_VISIT)) return;
          window.sessionStorage.setItem(SAVED_THIS_VISIT, "1");
        } catch {
          // Without this memory, it just saves the page more often.
        }
        registration.active?.postMessage({ type: "save-loop" });
      })
      .catch(() => {
        // The app works without it, only without offline and notifications.
      });
    return () => {
      cancelled = true;
    };
  }, [props.serviceWorker]);

  if (online && failures.length === 0) return null;

  return (
    <div className="flex flex-col">
      {!online && (
        <p role="status" className="flex items-center justify-center gap-2 bg-surface-2 px-4 py-1.5 text-center text-xs">
          <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
          {t("banner")}
        </p>
      )}
      {failures.length > 0 && (
        <div role="alert" className="flex items-start gap-2 bg-crimson-950 px-4 py-2 text-xs text-bone-50">
          <ul className="flex flex-1 flex-col gap-1">
            {failures.map((failure, index) => (
              <li key={index}>{failure}</li>
            ))}
          </ul>
          <Button type="button" variant="ghost" className="size-8 shrink-0" aria-label={t("dismiss")} onClick={() => setFailures([])}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
