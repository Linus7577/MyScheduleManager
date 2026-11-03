"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { MotionLevel } from "@/config/app.config";
import type { DoomBlock } from "../doom";

function Loading() {
  const t = useTranslations("states");
  return (
    <p role="status" className="py-10 text-center text-sm text-muted-foreground">
      {t("loading")}
    </p>
  );
}

const DoomClock = dynamic(() => import("./doom-clock").then((module) => module.DoomClock), {
  ssr: false,
  loading: Loading,
});

export function DoomClockLoader(props: { blocks: DoomBlock[]; today: string; timeZone: string; motion: MotionLevel }) {
  return <DoomClock {...props} />;
}
