"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { MotionLevel } from "@/config/app.config";
import { acknowledgeProgressAction } from "../actions";
import type { ReckoningView } from "../service";
import { Reckoning } from "./reckoning";

const Cinematic = dynamic(() => import("./cinematic").then((module) => module.Cinematic), { ssr: false });

/** The Reckoning comes first. Any level-up or tier-up plays once it's dismissed, and only once. */
export function GameOverlays(props: {
  reckoning: ReckoningView | null;
  level: number;
  tier: number;
  seenLevel: number;
  seenTier: number;
  motion: MotionLevel;
}) {
  const { reckoning, level, tier, seenLevel, seenTier, motion } = props;
  const [dismissed, setDismissed] = useState<string | null>(null);

  const progressKey = `${level}:${tier}`;
  const leveledUp = level > seenLevel;
  const tieredUp = tier > seenTier;
  const lostGround = level < seenLevel || tier < seenTier;
  const showCinematic = !reckoning && (leveledUp || tieredUp) && dismissed !== progressKey;

  // Falling back has no cinematic. Remembering it means climbing back earns the moment again.
  useEffect(() => {
    if (lostGround && !leveledUp && !tieredUp) void acknowledgeProgressAction();
  }, [lostGround, leveledUp, tieredUp]);

  if (reckoning) return <Reckoning view={reckoning} />;
  if (!showCinematic) return null;

  return (
    <Cinematic
      kind={tieredUp ? "tier" : "level"}
      level={level}
      tier={tier}
      motion={motion}
      onDone={() => {
        setDismissed(progressKey);
        void acknowledgeProgressAction();
      }}
    />
  );
}
