"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Flame, ShieldAlert, Swords, Volume2, VolumeX } from "lucide-react";
import type { MotionLevel } from "@/config/app.config";
import { LIGHTNING_GAP_SECONDS, type PowerState } from "@/config/game.config";
import { cn } from "@/lib/utils";
import { firstLine, pickLine, type LineId, type LineMood } from "../lines";
import {
  isSoundMuted,
  playSound,
  playThunder,
  playVoice,
  setSoundMuted,
  startAmbience,
  stopAmbience,
  subscribeSound,
  unlockSound,
} from "../sound";
import { ParticleCanvas } from "./particle-canvas";
import { Warrior } from "./warrior";

const EMBER = "#ff6a2b";
const POWER_INTENSITY: Record<PowerState, number> = { empowered: 1, steady: 0.7, wounded: 0.35, broken: 0.15 };
const FLASH_MS = 520;
const THUNDER_DELAY_MS = 450;

/** Forks of lightning across the sky. Drawn by code, so each strike can light up separately. */
const BOLTS = [
  "M12 0 L18 9 L13 15 L22 26 L17 33 L25 45",
  "M88 2 L80 12 L86 19 L75 30 L80 38 L71 47",
  "M60 0 L55 7 L62 13 L57 22",
  "M32 4 L38 12 L33 18 L41 26",
];

function SoundToggle() {
  const t = useTranslations("lobby");
  const muted = useSyncExternalStore(subscribeSound, isSoundMuted, () => false);
  const Icon = muted ? VolumeX : Volume2;

  return (
    <button
      type="button"
      aria-pressed={muted}
      aria-label={t("mute")}
      className="flex size-11 items-center justify-center rounded-full bg-black/60 text-bone ring-1 ring-crimson-700/70"
      onClick={() => setSoundMuted(!muted)}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

/** The living painting: the same picture, with the wings cut out so they can beat slowly around the shoulders. */
function Dragon() {
  const art = "/art/home/dragon.webp";
  const layer = "absolute inset-0 size-full select-none";
  return (
    <div aria-hidden="true" className="lobby-dragon absolute top-[3%] left-1/2 aspect-[826/1100] h-[74%] -translate-x-1/2 md:left-[34%] md:h-[92%]">
      <div className="dragon-breathe absolute inset-0">
        <Image src={art} alt="" fill unoptimized priority draggable={false} className={cn(layer, "dragon-wing-left")} />
        <Image src={art} alt="" fill unoptimized priority draggable={false} className={cn(layer, "dragon-wing-right")} />
        <Image src={art} alt="" fill unoptimized priority draggable={false} className={cn(layer, "dragon-body")} />
        <span className="dragon-veins absolute" />
        <span className="dragon-eye absolute" />
      </div>
    </div>
  );
}

export function HomeLobby(props: {
  tier: number;
  tierName: string;
  levelLine: string;
  streakDays: number;
  powerState: PowerState;
  armorFailing: boolean;
  mood: LineMood;
  today: string;
  next: { title: string; start_time: string; end_time: string } | null;
  motion: MotionLevel;
}) {
  const t = useTranslations("lobby");
  const home = useTranslations("home");
  const lines = useTranslations("warriorLines");
  const [line, setLine] = useState<LineId>(() => firstLine(props.mood, props.today));
  const [flash, setFlash] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Wind only plays here. It starts on the first tap anywhere, as browsers require.
  useEffect(() => {
    startAmbience();
    return stopAmbience;
  }, []);

  // A strike now and then, with its thunder just behind it. One at a time and well apart, so it never strobes.
  useEffect(() => {
    if (props.motion !== "full") return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const { min, max } = LIGHTNING_GAP_SECONDS;
      timer = setTimeout(strike, (min + Math.random() * (max - min)) * 1000);
    };
    const strike = () => {
      if (!document.hidden) {
        setFlash(true);
        setTimeout(() => setFlash(false), FLASH_MS);
        setTimeout(playThunder, THUNDER_DELAY_MS);
      }
      schedule();
    };
    schedule();
    return () => clearTimeout(timer);
  }, [props.motion]);

  function speak() {
    unlockSound();
    const next = pickLine(props.mood, line);
    setLine(next);
    playVoice(next);
    setSpeaking(true);
    setTimeout(() => setSpeaking(false), 900);
  }

  return (
    <section
      aria-label={t("label")}
      data-flash={flash}
      className="lobby relative isolate -mx-4 -mt-6 h-[calc(100dvh-8.5rem)] min-h-[36rem] overflow-hidden bg-black md:-mx-8 md:h-[calc(100dvh-4.75rem)]"
    >
      <Image
        src="/art/home/citadel.webp"
        alt=""
        fill
        unoptimized
        priority
        draggable={false}
        sizes="100vw"
        className="-z-20 object-cover object-top select-none"
      />
      <div aria-hidden="true" className="lobby-moon absolute -z-10" />
      <svg aria-hidden="true" viewBox="0 0 100 50" preserveAspectRatio="none" className="lobby-bolts absolute inset-x-0 top-0 -z-10 h-1/2 w-full">
        {BOLTS.map((bolt) => (
          <path key={bolt} d={bolt} fill="none" stroke="#ff8a4a" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div aria-hidden="true" className="lobby-flash absolute inset-0 -z-10" />

      <Dragon />
      <div aria-hidden="true" className="fog-layer absolute inset-y-0 -inset-x-[10%]" />
      <ParticleCanvas
        mode="drift"
        color={EMBER}
        motion={props.motion}
        intensity={POWER_INTENSITY[props.powerState]}
        className="pointer-events-none absolute inset-0 size-full"
      />

      <button
        type="button"
        aria-label={t("speak")}
        onClick={speak}
        className={cn(
          "lobby-warrior absolute bottom-[9%] left-1/2 h-[76%] -translate-x-1/2 md:bottom-0 md:left-[58%] md:h-[96%]",
          speaking && "lobby-warrior-speaking"
        )}
      >
        <Warrior tier={props.tier} powerState={props.powerState} className="h-full" />
      </button>

      <div aria-hidden="true" className="lobby-foot-fog absolute inset-x-0 bottom-0 h-1/2" />

      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2 md:inset-x-8">
        <div className="lobby-plate min-w-0 px-3 py-1.5">
          <p className="truncate font-heading text-base font-semibold text-bone">{props.tierName}</p>
          <p className="truncate text-xs text-bone-300">{props.levelLine}</p>
          <p className="flex items-center gap-1 text-xs text-bone-200">
            <Flame className="size-3.5 text-ember-400" aria-hidden="true" />
            {home("streak", { count: props.streakDays })}
          </p>
        </div>
        <SoundToggle />
      </div>

      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 md:inset-x-8 md:bottom-8 md:max-w-md">
        {props.armorFailing && (
          <p role="alert" className="lobby-plate flex items-center gap-1.5 px-3 py-1.5 text-xs text-crimson-300">
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
            {home("armorFailing")}
          </p>
        )}
        <p role="status" className="lobby-plate min-h-14 px-4 py-2.5 text-sm leading-snug text-bone md:text-base">
          {lines(line)}
        </p>
        <div className="flex items-stretch gap-2">
          <div className="lobby-plate min-w-0 flex-1 px-3 py-1.5">
            <p className="text-[11px] tracking-wide text-bone-300 uppercase">{t("nextBlock")}</p>
            <p className="truncate text-sm font-medium text-bone">
              {props.next ? (
                <>
                  <span className="tabular-nums">{props.next.start_time}</span> {props.next.title}
                </>
              ) : (
                t("noNextBlock")
              )}
            </p>
          </div>
          <Link href="/loop" onClick={() => playSound("tap")} className="lobby-button flex shrink-0 items-center gap-1.5 px-4 font-heading text-sm font-semibold text-white">
            <Swords className="size-4" aria-hidden="true" />
            {home("openLoop")}
          </Link>
        </div>
      </div>
    </section>
  );
}
