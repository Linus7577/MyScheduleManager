"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUGGESTIONS_PER_DAY } from "@/config/oracle.config";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { generateSuggestionAction } from "../actions";
import type { Suggestion } from "../types";

export function SuggestionWidget({ suggestion }: { suggestion: Suggestion | null }) {
  const t = useTranslations("oracle");
  const locale = useLocale();
  const { pending, error, run } = useScheduleAction();
  const used = suggestion?.generation_count ?? 0;
  const remaining = SUGGESTIONS_PER_DAY - used;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm break-words whitespace-pre-wrap">{suggestion?.text ?? t("noSuggestion")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || remaining <= 0}
          className="h-10 gap-1.5 px-3"
          onClick={() => run(() => generateSuggestionAction({ locale }))}
        >
          <Eye className="size-4" aria-hidden="true" />
          {pending ? t("thinking") : suggestion ? t("askAgain") : t("seekCounsel")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("suggestionsLeft", { count: remaining })}</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Link href="/oracle" className="flex min-h-10 w-fit items-center text-sm text-crimson-400 underline-offset-4 hover:underline">
        {t("openChat")}
      </Link>
    </div>
  );
}
