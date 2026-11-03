"use client";

import { useEffect, useTransition } from "react";
import { refreshMarketAction } from "../actions";

/**
 * Asks for fresh prices and rates once the page is already on screen, so a slow outside source never delays it.
 * The numbers update by themselves when the answer arrives. It asks again only when something newly goes out of
 * date, such as a first trade in a new stock. A failure just leaves the last known values showing.
 */
export function MarketRefresher({ stale }: { stale: boolean }) {
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!stale) return;
    startTransition(async () => {
      await refreshMarketAction({ force: false });
    });
  }, [stale]);

  return null;
}
