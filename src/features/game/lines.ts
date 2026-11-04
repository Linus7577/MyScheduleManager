import { WARRIOR_RISING_STREAK_DAYS, type PowerState } from "@/config/game.config";

/** The warrior's lines by mood. The ids name his Japanese voice clips and the translated text. */
export const WARRIOR_LINES = {
  rising: ["r1", "r2", "r3"],
  steady: ["s1", "s2", "s3", "s4"],
  wounded: ["w1", "w2", "w3"],
  broken: ["b1", "b2"],
  allDone: ["a1", "a2"],
  blockDone: ["d1", "d2", "d3"],
  blockSkipped: ["k1", "k2"],
  levelUp: ["l1"],
  tierUp: ["t1"],
} as const;

export type LineMood = keyof typeof WARRIOR_LINES;
export type LineId = (typeof WARRIOR_LINES)[LineMood][number];

/** What he talks about on Home. A hurt warrior hears about that first, whatever else is going on. */
export function moodFor(state: {
  powerState: PowerState;
  streakDays: number;
  blocksToday: number;
  blocksLeft: number;
}): LineMood {
  if (state.powerState === "broken") return "broken";
  if (state.powerState === "wounded") return "wounded";
  if (state.blocksToday > 0 && state.blocksLeft === 0) return "allDone";
  if (state.powerState === "empowered" || state.streakDays >= WARRIOR_RISING_STREAK_DAYS) return "rising";
  return "steady";
}

/** A line for this mood. Never the one he just said, if he has another. */
export function pickLine(mood: LineMood, previous: LineId | null, random: () => number = Math.random): LineId {
  const lines: readonly LineId[] = WARRIOR_LINES[mood];
  const choices = lines.length > 1 ? lines.filter((line) => line !== previous) : lines;
  return choices[Math.floor(random() * choices.length)];
}

/** The same line all day until he's tapped, so the server and the browser agree on the first one. */
export function firstLine(mood: LineMood, today: string): LineId {
  const lines: readonly LineId[] = WARRIOR_LINES[mood];
  return lines[Number(today.slice(-2)) % lines.length];
}

type TimedBlock = { title: string; start_time: string; end_time: string; status: string; is_cancelled: boolean };

/** The block still to fight today: one running now, or else the next to start. */
export function nextBlock<T extends TimedBlock>(blocks: T[], timeNow: string): T | null {
  const open = blocks
    .filter((block) => !block.is_cancelled && block.status === "planned" && block.end_time > timeNow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  return open[0] ?? null;
}
