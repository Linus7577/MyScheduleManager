"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion as animate } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/config/app.config";
import { ParticleCanvas } from "./particle-canvas";

const LEVEL_UP_MS = 3000;
const TIER_UP_MS = 5000;
const GOLD = "#d4af37";

/** Full-screen level-up or tier-up moment. Skippable, and it's the one place gold appears besides "all blocks done". */
export function Cinematic(props: {
  kind: "level" | "tier";
  level: number;
  tier: number;
  motion: MotionLevel;
  onDone: () => void;
}) {
  const t = useTranslations("cinematic");
  const tiers = useTranslations("tiers");
  const { kind, motion, onDone } = props;
  const isTier = kind === "tier";
  const still = motion !== "full";

  const finished = useRef(onDone);
  useEffect(() => {
    finished.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (still) return;
    const timer = setTimeout(() => finished.current(), isTier ? TIER_UP_MS : LEVEL_UP_MS);
    return () => clearTimeout(timer);
  }, [isTier, still]);

  return (
    <animate.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cinematic-title"
      initial={still ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-bg/95 p-4 text-center"
    >
      <ParticleCanvas mode="burst" color={GOLD} motion={motion} intensity={isTier ? 3 : 2} className="pointer-events-none absolute inset-0 size-full" />
      <animate.p
        initial={still ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative text-sm tracking-widest text-gold-400 uppercase"
      >
        {isTier ? t("tierUp") : t("levelUp")}
      </animate.p>
      <animate.h1
        id="cinematic-title"
        initial={still ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, delay: isTier ? 0.6 : 0.2, ease: "easeOut" }}
        className="relative text-4xl font-semibold text-gold-300 md:text-6xl"
      >
        {isTier ? tiers(String(props.tier)) : t("levelNumber", { level: props.level })}
      </animate.h1>
      <Button type="button" variant="outline" className="relative mt-6 h-11 px-5" onClick={onDone}>
        {still ? t("continue") : t("skip")}
      </Button>
    </animate.div>
  );
}
