import { FxAttribution } from "@/features/finance/components/fx-attribution";
import { MarketRefresher } from "@/features/finance/components/market-refresher";
import { PortfolioPage } from "@/features/finance/components/portfolio";
import { getMarketData } from "@/features/finance/market-data-config";
import { ensureFinanceReady, getPortfolioView } from "@/features/finance/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function PortfolioRoute() {
  const ctx = await getScheduleContext();
  await ensureFinanceReady(ctx);
  const view = await getPortfolioView(ctx, getMarketData());

  return (
    <>
      <MarketRefresher stale={view.stale} />
      <PortfolioPage
        valued={view.valued}
        totals={view.totals}
        trades={view.trades}
        rates={view.rates}
        snapshots={view.snapshots}
        byHolding={view.byHolding}
        byMarket={view.byMarket}
        dividendsTwd={view.dividendsTwd}
        dividendsByHolding={view.dividendsByHolding}
        hasUsSource={view.hasUsSource}
        today={ctx.today}
      />
      <FxAttribution />
    </>
  );
}
