"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { OTHER_COLOR, SERIES_COLORS } from "./chart-palette";

export const GRID = "rgb(232 228 220 / 12%)";
export const AXIS_TEXT = { fill: "#9d9894", fontSize: 12 };
export const SURFACE = "#121216";
export const BAR_MAX_WIDTH = 24;
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

export const TOOLTIP_STYLE = {
  backgroundColor: "#1a1a20",
  border: "1px solid rgb(232 228 220 / 18%)",
  borderRadius: 8,
  color: "#e8e4dc",
  fontSize: 12,
};

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function TableView({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  const t = useTranslations("charts");
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer py-1">{t("viewAsTable")}</summary>
      <div className="overflow-x-auto">
        <table className="mt-1 w-full text-left tabular-nums">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} className="py-1 pr-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, index) => (
                  <td key={index} className="py-0.5 pr-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function useShortDate() {
  const format = useFormatter();
  return (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), { month: "numeric", day: "numeric", timeZone: "UTC" });
}

/** One line over time, so it needs no legend: the title names it. */
export function ProgressChart({ data, label }: { data: { date: string; percent: number }[]; label: string }) {
  const t = useTranslations("charts");
  const shortDate = useShortDate();
  const points = data.map((point) => ({ ...point, day: shortDate(point.date) }));

  return (
    <div className="flex flex-col gap-2">
      <div className="h-48 w-full" role="img" aria-label={t("progressAlt", { label })}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tick={AXIS_TEXT} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={AXIS_TEXT} tickLine={false} axisLine={false} unit="%" />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value}%`, label]} />
            <Line
              type="monotone"
              dataKey="percent"
              stroke={SERIES_COLORS[1]}
              strokeWidth={2}
              dot={{ r: 4, fill: SERIES_COLORS[1], stroke: SURFACE, strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TableView headers={[t("date"), t("progress")]} rows={points.map((point) => [point.day, `${point.percent}%`])} />
    </div>
  );
}

/** Planned against done minutes for each day of this week. */
export function WeeklyChart({ data }: { data: { date: string; planned: number; done: number }[] }) {
  const t = useTranslations("charts");
  const format = useFormatter();
  const points = data.map((point) => ({
    ...point,
    day: format.dateTime(new Date(`${point.date}T00:00:00Z`), { weekday: "short", timeZone: "UTC" }),
  }));
  const plannedLabel = t("planned");
  const doneLabel = t("done");

  return (
    <div className="flex flex-col gap-2">
      <Legend
        items={[
          { label: plannedLabel, color: SERIES_COLORS[0] },
          { label: doneLabel, color: SERIES_COLORS[1] },
        ]}
      />
      <div className="h-48 w-full" role="img" aria-label={t("weeklyAlt")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tick={AXIS_TEXT} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS_TEXT} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgb(232 228 220 / 6%)" }} />
            <Bar dataKey="planned" name={plannedLabel} fill={SERIES_COLORS[0]} maxBarSize={BAR_MAX_WIDTH} radius={BAR_RADIUS} isAnimationActive={false} />
            <Bar dataKey="done" name={doneLabel} fill={SERIES_COLORS[1]} maxBarSize={BAR_MAX_WIDTH} radius={BAR_RADIUS} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        headers={[t("day"), plannedLabel, doneLabel]}
        rows={points.map((point) => [point.day, point.planned, point.done])}
      />
    </div>
  );
}

/** Minutes per week, stacked by track. Colour follows the track, and anything past eight folds into "Other". */
export function StudyChart(props: {
  weeks: { weekStart: string; minutes: Record<string, number> }[];
  tracks: { id: string; title: string }[];
}) {
  const t = useTranslations("charts");
  const shortDate = useShortDate();

  const named = props.tracks.slice(0, SERIES_COLORS.length);
  const namedIds = new Set(named.map((track) => track.id));
  const hasOther = props.tracks.length > named.length;
  const otherKey = "other";

  const points = props.weeks.map((week) => {
    const point: Record<string, string | number> = { week: shortDate(week.weekStart) };
    for (const [trackId, minutes] of Object.entries(week.minutes)) {
      const key = namedIds.has(trackId) ? trackId : otherKey;
      point[key] = Number(point[key] ?? 0) + minutes;
    }
    return point;
  });

  const series = [
    ...named.map((track, index) => ({ key: track.id, label: track.title, color: SERIES_COLORS[index] })),
    ...(hasOther ? [{ key: otherKey, label: t("other"), color: OTHER_COLOR }] : []),
  ];

  return (
    <div className="flex flex-col gap-2">
      <Legend items={series} />
      <div className="h-56 w-full" role="img" aria-label={t("studyAlt")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="week" tick={AXIS_TEXT} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS_TEXT} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgb(232 228 220 / 6%)" }} />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                stackId="study"
                fill={item.color}
                stroke={SURFACE}
                strokeWidth={2}
                maxBarSize={BAR_MAX_WIDTH}
                radius={index === series.length - 1 ? BAR_RADIUS : undefined}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        headers={[t("week"), ...series.map((item) => item.label)]}
        rows={points.map((point) => [point.week as string, ...series.map((item) => Number(point[item.key] ?? 0))])}
      />
    </div>
  );
}
