"use client";

import dynamic from "next/dynamic";

// Its saved start time lives in this browser, so it only renders in the browser.
const FocusTimer = dynamic(() => import("./focus-timer").then((module) => module.FocusTimer), { ssr: false });

export function FocusTimerLoader(props: { id: string; title: string; minutes: number; logNote: string }) {
  return <FocusTimer {...props} />;
}
