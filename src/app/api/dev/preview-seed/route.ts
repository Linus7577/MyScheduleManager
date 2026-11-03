import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DEFAULT_TIMEZONE } from "@/config/app.config";
import { levelForXp, tierForLevel } from "@/features/game/engine";
import { getPreviewRepo, resetPreviewStore } from "@/features/schedule/memory-repo";
import { addDays } from "@/features/schedule/logic";
import type { NewInstance } from "@/features/schedule/types";
import { isAuthPreviewEnabled } from "@/lib/auth/access";
import { todayInTimeZone } from "@/lib/time/today";

const seedSchema = z.strictObject({
  xp: z.coerce.number().int().min(0).max(1_000_000).optional(),
  yesterday: z.literal("1").optional(),
  today: z.literal("1").optional(),
});

const testBlock = (date: string): NewInstance => ({
  date,
  start_time: "06:00",
  end_time: "07:00",
  category: "study",
  title: "Test block",
  notes: "",
  status: "planned",
  template_block_id: null,
  event_id: null,
});

/**
 * Resets preview mode's temporary store to a known state, so browser tests can reach things that normally
 * depend on a real midnight. It works only in preview mode, and answers 404 everywhere else.
 */
export async function GET(request: NextRequest) {
  if (!isAuthPreviewEnabled()) return new NextResponse(null, { status: 404 });

  const parsed = seedSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { xp, yesterday, today } = parsed.data;

  resetPreviewStore();
  const repo = getPreviewRepo();
  await repo.createGameState();

  const todayDate = todayInTimeZone(DEFAULT_TIMEZONE);
  const rows: NewInstance[] = [];
  if (yesterday) rows.push(testBlock(addDays(todayDate, -1)));
  if (today) rows.push(testBlock(todayDate));
  await repo.insertInstances(rows);

  if (xp !== undefined) {
    const state = await repo.getGameState();
    if (!state) throw new Error("Preview game state is missing");
    const tier = tierForLevel(levelForXp(xp));
    await repo.commitGame({
      expected_version: state.version,
      close_date: null,
      instances: [],
      ledger: [
        {
          date: todayDate,
          source: "correction",
          block_instance_id: null,
          block_title: "",
          reason: "correction",
          delta_xp: xp,
          delta_power: 0,
          tier,
        },
      ],
      state: { ...state, total_xp: xp, tier },
      summaries: [],
      audit: [],
    });
  }

  return NextResponse.json({ ok: true });
}
