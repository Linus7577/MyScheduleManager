import { AVATAR_EYE_Y_BY_TIER, type PowerState } from "@/config/game.config";
import { cn } from "@/lib/utils";

const SATURATION: Record<PowerState, string> = {
  empowered: "saturate-100",
  steady: "saturate-100",
  wounded: "saturate-[0.65]",
  broken: "saturate-[0.3]",
};

const AURA_OPACITY: Record<PowerState, number> = { empowered: 0.75, steady: 0.45, wounded: 0.22, broken: 0.14 };
const EYE_OPACITY: Record<PowerState, number> = { empowered: 1, steady: 0.85, wounded: 0.6, broken: 0.4 };
const CRACK_OPACITY: Record<PowerState, number> = { empowered: 0, steady: 0, wounded: 0.55, broken: 1 };

/** The rune halo gains rings and marks as the tier rises. */
function RuneHalo({ tier }: { tier: number }) {
  const rings = Math.ceil(tier / 3);
  const marks = tier * 4;
  return (
    <g fill="none" stroke="var(--color-crimson-500)">
      {Array.from({ length: rings }, (_, ring) => (
        <circle key={ring} cx="50" cy="32" r={26 + ring * 5} strokeWidth="0.6" strokeDasharray={ring % 2 ? "2 3" : undefined} />
      ))}
      {Array.from({ length: marks }, (_, mark) => (
        <line
          key={mark}
          x1="50"
          y1={32 - 24}
          x2="50"
          y2={32 - 26}
          strokeWidth="0.8"
          stroke="var(--color-ember-400)"
          transform={`rotate(${(360 / marks) * mark} 50 32)`}
        />
      ))}
    </g>
  );
}

/** A placeholder until the owner uploads their art in Phase 7. It gets more imposing with each tier. */
function Silhouette({ tier }: { tier: number }) {
  const shoulder = 22 + tier * 1.6;
  const fill = "var(--color-ash-950)";
  const edge = "var(--color-crimson-800)";

  return (
    <g fill={fill} stroke={edge} strokeWidth="0.8" strokeLinejoin="round">
      {tier >= 7 && (
        <path d={`M${50 - shoulder} 60 Q14 40 6 74 Q22 68 ${50 - shoulder + 4} 78 Z M${50 + shoulder} 60 Q86 40 94 74 Q78 68 ${50 + shoulder - 4} 78 Z`} />
      )}
      <path
        d={`M${50 - shoulder} 58 Q50 46 ${50 + shoulder} 58 L${50 + shoulder - 6} 92 L62 100 L66 146 L54 146 L50 108 L46 108 L46 146 L34 146 L38 100 L${50 - shoulder + 6} 92 Z`}
      />
      <path d="M38 34 Q38 16 50 16 Q62 16 62 34 L60 46 Q50 52 40 46 Z" />
      {tier >= 5 && <path d="M40 22 Q28 16 28 4 Q36 12 44 18 Z M60 22 Q72 16 72 4 Q64 12 56 18 Z" />}
      {tier >= 6 && <path d="M42 15 L44 7 L47 13 L50 5 L53 13 L56 7 L58 15 Z" fill="var(--color-crimson-900)" />}
      {tier >= 3 && <path d={`M${50 - shoulder} 58 L${50 - shoulder - 6} 72 L${50 - shoulder + 8} 70 Z M${50 + shoulder} 58 L${50 + shoulder + 6} 72 L${50 + shoulder - 8} 70 Z`} />}
    </g>
  );
}

function Cracks({ opacity }: { opacity: number }) {
  if (opacity === 0) return null;
  return (
    <g fill="none" stroke="var(--color-crimson-400)" strokeWidth="0.7" opacity={opacity} strokeLinecap="round">
      <path d="M44 62 L48 72 L43 80 L49 92" />
      <path d="M60 66 L55 76 L60 84" />
      <path d="M46 24 L49 32 L45 40" />
      <path d="M38 96 L42 112 L38 128" />
    </g>
  );
}

export function Avatar(props: { tier: number; powerState: PowerState; portrait?: boolean; className?: string }) {
  const { tier, powerState, portrait } = props;
  const eyeY = AVATAR_EYE_Y_BY_TIER[tier - 1];
  const auraId = portrait ? "avatar-aura-portrait" : "avatar-aura";
  const isEclipse = tier === 8;

  return (
    <svg
      viewBox={portrait ? "22 4 56 56" : "0 0 100 150"}
      aria-hidden="true"
      data-power-state={powerState}
      className={cn(SATURATION[powerState], !portrait && "avatar-breathe", props.className)}
    >
      <defs>
        <radialGradient id={auraId}>
          <stop offset="0%" stopColor={isEclipse ? "var(--color-crimson-400)" : "var(--color-crimson-500)"} />
          <stop offset="100%" stopColor="var(--color-crimson-500)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        cx="50"
        cy="60"
        rx="46"
        ry="60"
        fill={`url(#${auraId})`}
        opacity={AURA_OPACITY[powerState]}
        className={powerState === "broken" ? "avatar-flicker" : undefined}
      />
      {isEclipse && <circle cx="50" cy="32" r="22" fill="var(--color-bg)" stroke="var(--color-gold-500)" strokeWidth="1" />}
      <RuneHalo tier={tier} />
      <Silhouette tier={tier} />
      <g fill="var(--color-crimson-400)" opacity={EYE_OPACITY[powerState]}>
        <ellipse cx="45" cy={eyeY} rx="2.4" ry="1.3" />
        <ellipse cx="55" cy={eyeY} rx="2.4" ry="1.3" />
      </g>
      <Cracks opacity={CRACK_OPACITY[powerState]} />
    </svg>
  );
}
