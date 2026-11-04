"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { clearQueue } from "@/features/schedule/offline-queue";

/** Signing out also clears what this device saved for offline, so the next person can't read it. */
export function SignOutForm() {
  const t = useTranslations("settings");
  return (
    <form
      action="/auth/signout"
      method="post"
      onSubmit={() => {
        clearQueue();
        navigator.serviceWorker?.controller?.postMessage({ type: "sign-out" });
      }}
    >
      <Button type="submit" variant="outline" className="h-11 px-4">
        {t("signOut")}
      </Button>
    </form>
  );
}
