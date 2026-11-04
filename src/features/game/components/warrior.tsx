import Image from "next/image";
import { WARRIOR_ART_BY_TIER, WARRIOR_EYES_BY_ART, type PowerState } from "@/config/game.config";
import { cn } from "@/lib/utils";

const SATURATION: Record<PowerState, string> = {
  empowered: "saturate-125",
  steady: "saturate-100",
  wounded: "saturate-[0.65]",
  broken: "saturate-[0.3]",
};

const AURA_OPACITY: Record<PowerState, number> = { empowered: 1, steady: 0.75, wounded: 0.45, broken: 0.3 };
const EYE_OPACITY: Record<PowerState, number> = { empowered: 1, steady: 0.85, wounded: 0.55, broken: 0.35 };
const CRACK_OPACITY: Record<PowerState, number> = { empowered: 0, steady: 0, wounded: 0.55, broken: 1 };

const ART_WIDTH = 720;
const ART_HEIGHT = 1080;

/** His face, for the status strip. */
export function WarriorFace({ tier, powerState }: { tier: number; powerState: PowerState }) {
  return (
    <Image
      src={`/art/warrior/tier-${WARRIOR_ART_BY_TIER[tier - 1]}-face.webp`}
      alt=""
      width={96}
      height={96}
      unoptimized
      data-power-state={powerState}
      className={cn("size-10 object-cover", SATURATION[powerState])}
    />
  );
}

/** The painted warrior with his code-driven layers. Hurting him drains the color and opens cracks in the armor. */
export function Warrior({ tier, powerState, className }: { tier: number; powerState: PowerState; className?: string }) {
  const art = WARRIOR_ART_BY_TIER[tier - 1];
  const crackOpacity = CRACK_OPACITY[powerState];

  return (
    <div data-power-state={powerState} className={cn("relative aspect-[2/3]", className)}>
      {/* The mysterious aura: dark mist rising through a crimson glow, stronger the more Power he has. */}
      <div aria-hidden="true" className="warrior-aura absolute inset-[-8%]" style={{ opacity: AURA_OPACITY[powerState] }}>
        <span className="warrior-wisp warrior-wisp-1" />
        <span className="warrior-wisp warrior-wisp-2" />
        <span className="warrior-wisp warrior-wisp-3" />
      </div>
      <div className={cn("warrior-breathe relative size-full", powerState === "broken" && "avatar-flicker")}>
        <Image
          src={`/art/warrior/tier-${art}.webp`}
          alt=""
          width={ART_WIDTH}
          height={ART_HEIGHT}
          unoptimized
          priority
          draggable={false}
          className={cn("size-full select-none", SATURATION[powerState])}
        />
        {WARRIOR_EYES_BY_ART[art].map((eye) => (
          <span
            key={eye.x}
            aria-hidden="true"
            className="warrior-eye absolute"
            style={{ left: `${eye.x}%`, top: `${eye.y}%`, opacity: EYE_OPACITY[powerState] }}
          />
        ))}
        {crackOpacity > 0 && (
          <svg
            aria-hidden="true"
            viewBox="0 0 100 150"
            className="absolute inset-0 size-full"
            fill="none"
            stroke="var(--color-crimson-400)"
            strokeWidth="0.5"
            strokeLinecap="round"
            opacity={crackOpacity}
          >
            <path d="M42 30 L46 38 L41 45 L46 56" />
            <path d="M60 32 L55 41 L60 49" />
            <path d="M38 62 L42 74 L38 86" />
            <path d="M62 66 L58 78 L63 90" />
          </svg>
        )}
      </div>
    </div>
  );
}
