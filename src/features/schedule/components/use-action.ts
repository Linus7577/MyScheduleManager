"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "../types";

/** Runs a server action, tracks that it's busy, and turns a failure into a translated message. */
export function useScheduleAction() {
  const t = useTranslations("errors");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) onSuccess?.();
        else setError(t(result.code));
      } catch {
        setError(t("failed"));
      }
    });
  }

  return { pending, error, run, clearError: () => setError(null) };
}
