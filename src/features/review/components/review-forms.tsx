"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { saveWeeklyAnswersAction, writeWeeklyReviewAction } from "../actions";
import type { WeeklyAnswers } from "../types";

const PROMPTS = ["worked", "didnt", "focus"] as const;

export function WeeklyPrompts(props: { week: string; answers: WeeklyAnswers }) {
  const t = useTranslations("review");
  const { pending, error, run } = useScheduleAction();
  const [values, setValues] = useState(props.answers);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        run(() => saveWeeklyAnswersAction({ week: props.week, ...values }), () => setSaved(true));
      }}
    >
      {PROMPTS.map((prompt) => (
        <div key={prompt} className="flex flex-col gap-2">
          <Label htmlFor={`review-${prompt}`}>{t(`prompt_${prompt}`)}</Label>
          <Textarea
            id={`review-${prompt}`}
            rows={3}
            maxLength={4000}
            value={values[prompt]}
            onChange={(event) => {
              setSaved(false);
              setValues({ ...values, [prompt]: event.target.value });
            }}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11 px-4" disabled={pending}>
          {t("saveAnswers")}
        </Button>
        {saved && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("answersSaved")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

export function WriteReviewButton(props: { week: string; rewrite: boolean }) {
  const t = useTranslations("review");
  const locale = useLocale();
  const { pending, error, run } = useScheduleAction();

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={props.rewrite ? "outline" : "default"}
        className="h-11 px-4"
        disabled={pending}
        onClick={() => run(() => writeWeeklyReviewAction({ week: props.week, locale }))}
      >
        {pending ? t("writing") : props.rewrite ? t("rewrite") : t("write")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
