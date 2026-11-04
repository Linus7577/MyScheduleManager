"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { PowerState } from "@/config/game.config";
import { pickLine, type LineId, type LineMood } from "../lines";
import { playSound, playVoice, unlockSound, type SoundName } from "../sound";
import { WarriorFace } from "./warrior";

const SPEECH_EVENT = "warrior-speaks";
const SHOW_MS = 4000;

const MOMENT_SOUND: Partial<Record<LineMood, SoundName>> = {
  blockDone: "done",
  blockSkipped: "skip",
  levelUp: "levelUp",
  tierUp: "tierUp",
};

/** A key moment: its sound, and a line from him. Cinematics show their own screen, so they skip the speech box. */
export function announce(mood: LineMood, options: { silentText?: boolean } = {}): void {
  const sound = MOMENT_SOUND[mood];
  if (sound) playSound(sound);
  const line = pickLine(mood, null);
  playVoice(line);
  if (!options.silentText) window.dispatchEvent(new CustomEvent<LineId>(SPEECH_EVENT, { detail: line }));
}

/** Runs on every page: lets sound start on the first tap, clicks on buttons, and his speech box. */
export function GameSound({ tier, powerState }: { tier: number; powerState: PowerState }) {
  const lines = useTranslations("warriorLines");
  const [line, setLine] = useState<LineId | null>(null);

  useEffect(() => {
    const onTap = (event: PointerEvent) => {
      unlockSound();
      if ((event.target as Element | null)?.closest?.("button, a")) playSound("tap");
    };
    window.addEventListener("pointerdown", onTap);
    return () => window.removeEventListener("pointerdown", onTap);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onSpeech = (event: Event) => {
      setLine((event as CustomEvent<LineId>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setLine(null), SHOW_MS);
    };
    window.addEventListener(SPEECH_EVENT, onSpeech);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(SPEECH_EVENT, onSpeech);
    };
  }, []);

  if (!line) return null;

  return (
    <p
      role="status"
      className="lobby-plate fixed inset-x-3 bottom-20 z-40 flex items-center gap-3 p-2 text-sm text-bone md:inset-x-auto md:right-8 md:bottom-8 md:max-w-sm"
    >
      <span className="size-10 shrink-0 overflow-hidden rounded-full bg-surface-2">
        <WarriorFace tier={tier} powerState={powerState} />
      </span>
      {lines(line)}
    </p>
  );
}
