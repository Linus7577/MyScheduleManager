"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

function ChartLoading() {
  const t = useTranslations("states");
  return (
    <p role="status" className="h-48 py-10 text-center text-sm text-muted-foreground">
      {t("loading")}
    </p>
  );
}

// The chart library is heavy, so it only downloads when a chart is actually on screen.
export const ProgressChart = dynamic(() => import("./charts").then((module) => module.ProgressChart), {
  ssr: false,
  loading: ChartLoading,
});

export const WeeklyChart = dynamic(() => import("./charts").then((module) => module.WeeklyChart), {
  ssr: false,
  loading: ChartLoading,
});

export const StudyChart = dynamic(() => import("./charts").then((module) => module.StudyChart), {
  ssr: false,
  loading: ChartLoading,
});
