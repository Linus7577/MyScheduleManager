"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

function CalendarLoading() {
  const t = useTranslations("states");
  return (
    <p role="status" className="py-10 text-center text-sm text-muted-foreground">
      {t("loading")}
    </p>
  );
}

// The calendar is heavy, so its code only downloads on this page, and only in the browser.
const CalendarView = dynamic(() => import("./calendar-view").then((module) => module.CalendarView), {
  ssr: false,
  loading: CalendarLoading,
});

export function CalendarLoader(props: { timeZone: string; locale: string; today: string }) {
  return <CalendarView {...props} />;
}
