"use client";

import { useSyncExternalStore } from "react";
import { wallClockInTimeZone } from "@/lib/time/today";

function subscribe(notify: () => void) {
  const timer = setInterval(notify, 1000);
  return () => clearInterval(timer);
}

/** The owner's current local time, updating every second. Null during server rendering. */
export function useWallClock(timeZone: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => wallClockInTimeZone(timeZone),
    () => null
  );
}
