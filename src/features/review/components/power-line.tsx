import { LOSS_COLOR } from "@/features/command/components/chart-palette";
import type { PowerDay } from "../logic";

const WIDTH = 320;
const HEIGHT = 96;
const PADDING = 12;

/** One line, one axis from 0 to 100. The values are printed under it as well, so nothing depends on the line alone. */
export function PowerLine(props: { days: PowerDay[]; labelFor: (date: string) => string; title: string }) {
  const { days } = props;
  if (days.length === 0) return null;
  // The middle of each column of the table below, so every dot sits above its day.
  const x = (index: number) => ((index + 0.5) * WIDTH) / days.length;
  const y = (power: number) => PADDING + ((100 - power) * (HEIGHT - PADDING * 2)) / 100;
  const points = days.map((day, index) => `${x(index)},${y(day.power)}`).join(" ");

  return (
    <figure className="flex max-w-md flex-col gap-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={props.title} className="w-full">
        <line x1={PADDING} x2={WIDTH - PADDING} y1={y(100)} y2={y(100)} stroke="currentColor" strokeOpacity={0.12} />
        <line x1={PADDING} x2={WIDTH - PADDING} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.12} />
        <polyline points={points} fill="none" stroke={LOSS_COLOR} strokeWidth={2} strokeLinejoin="round" />
        {days.map((day, index) => (
          <circle key={day.date} cx={x(index)} cy={y(day.power)} r={4} fill={LOSS_COLOR} stroke="var(--card)" strokeWidth={2}>
            <title>{`${props.labelFor(day.date)}: ${day.power}`}</title>
          </circle>
        ))}
      </svg>
      <table className="w-full table-fixed text-center text-xs">
        <thead>
          <tr>
            {days.map((day) => (
              <th key={day.date} scope="col" className="font-normal text-muted-foreground">
                {props.labelFor(day.date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {days.map((day) => (
              <td key={day.date} className="tabular-nums">
                {day.power}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </figure>
  );
}
