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
export const MonthTrendChart = dynamic(() => import("./charts").then((module) => module.MonthTrendChart), {
  ssr: false,
  loading: ChartLoading,
});

export const YearTrendChart = dynamic(() => import("./charts").then((module) => module.YearTrendChart), {
  ssr: false,
  loading: ChartLoading,
});

export const ValueHistoryChart = dynamic(() => import("./charts").then((module) => module.ValueHistoryChart), {
  ssr: false,
  loading: ChartLoading,
});
