import { cn } from "@/lib/utils";

const CENTER = 100;
const OUTER_RADIUS = 92;
const INNER_RADIUS = 78;
const SEGMENT_GAP_DEGREES = 3;
const HOURS = 24;

function arcPath(radius: number, startDegrees: number, endDegrees: number): string {
  const point = (degrees: number) => {
    const radians = ((degrees - 90) * Math.PI) / 180;
    return `${(CENTER + radius * Math.cos(radians)).toFixed(3)} ${(CENTER + radius * Math.sin(radians)).toFixed(3)}`;
  };
  const large = endDegrees - startDegrees > 180 ? 1 : 0;
  return `M ${point(startDegrees)} A ${radius} ${radius} 0 ${large} 1 ${point(endDegrees)}`;
}

/** Outer ring: 24 segments, one per hour, with passed hours burned out. Inner ring: progress of the current block. */
export function DoomRings(props: { currentHour: number; blockProgress: number | null; allDone: boolean; children?: React.ReactNode }) {
  const { currentHour, blockProgress, allDone } = props;
  const span = 360 / HOURS;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <svg viewBox="0 0 200 200" aria-hidden="true" className="absolute inset-0 size-full">
        {Array.from({ length: HOURS }, (_, hour) => {
          const start = hour * span + SEGMENT_GAP_DEGREES / 2;
          const end = (hour + 1) * span - SEGMENT_GAP_DEGREES / 2;
          const isCurrent = hour === currentHour;
          return (
            <path
              key={hour}
              d={arcPath(OUTER_RADIUS, start, end)}
              fill="none"
              strokeWidth={isCurrent ? 6 : 4}
              strokeLinecap="butt"
              className={cn(
                allDone && "stroke-gold-500",
                !allDone && hour < currentHour && "stroke-ash-800",
                !allDone && isCurrent && "doom-pulse stroke-crimson-500",
                !allDone && hour > currentHour && "stroke-crimson-900"
              )}
            />
          );
        })}
        <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS} fill="none" strokeWidth="2" className="stroke-surface-2" />
        {blockProgress !== null && blockProgress > 0 && (
          <path
            d={arcPath(INNER_RADIUS, 0, Math.min(blockProgress, 0.999) * 360)}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className={allDone ? "stroke-gold-400" : "stroke-ember-500"}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-12 text-center">{props.children}</div>
    </div>
  );
}
