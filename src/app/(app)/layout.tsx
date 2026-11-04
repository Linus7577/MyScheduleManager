import { getTranslations } from "next-intl/server";
import { BottomNav } from "@/components/shell/bottom-nav";
import { PlaceBackdrop, PlaceName } from "@/components/shell/place-backdrop";
import { Sidebar } from "@/components/shell/sidebar";
import { StatusStrip } from "@/components/shell/status-strip";
import { GameOverlays } from "@/features/game/components/game-overlays";
import { GameSound } from "@/features/game/components/game-sound";
import { getGameView, getReckoning } from "@/features/game/service";
import { getScheduleContext } from "@/features/schedule/context";
import { getMotionLevel } from "@/features/settings/queries";
import { requireOwner } from "@/lib/auth/owner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  const t = await getTranslations("preview");
  const ctx = await getScheduleContext();
  const [game, reckoning, motion] = await Promise.all([getGameView(ctx), getReckoning(ctx), getMotionLevel()]);

  return (
    <div data-motion={motion} className="min-h-dvh md:pl-56">
      <PlaceBackdrop />
      <Sidebar />
      <div className="flex min-h-dvh flex-col">
        <StatusStrip game={game} timeZone={ctx.timeZone} />
        {owner.preview && (
          <p role="note" className="bg-ember-950 px-4 py-1.5 text-center text-xs text-ember-100">
            {t("banner")}
          </p>
        )}
        <main className="flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-8">
          <PlaceName />
          {children}
        </main>
      </div>
      <BottomNav />
      <GameSound tier={game.tier} powerState={game.powerState} />
      <GameOverlays
        reckoning={reckoning}
        level={game.level}
        tier={game.tier}
        seenLevel={game.seenLevel}
        seenTier={game.seenTier}
        motion={motion}
      />
    </div>
  );
}
