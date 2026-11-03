import "server-only";
import { isAuthPreviewEnabled } from "@/lib/auth/access";
import { createMarketData, previewMarketData, type MarketData } from "./market-data";

/** Chooses real sources or, in preview mode, fixed answers. The key never leaves the server. */
export function getMarketData(): MarketData {
  return isAuthPreviewEnabled() ? previewMarketData : createMarketData(process.env.FINNHUB_API_KEY);
}
