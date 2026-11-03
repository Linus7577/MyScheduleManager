"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EXPENSE_COLOR, INCOME_COLOR, SERIES_COLORS } from "@/features/command/components/chart-palette";
import {
  AXIS_TEXT,
  BAR_MAX_WIDTH,
  BAR_RADIUS,
  GRID,
  Legend,
  SURFACE,
  TableView,
  TOOLTIP_STYLE,
} from "@/features/command/components/charts";
import type { TrendPoint } from "../logic";
import type { PortfolioSnapshot } from "../types";
import { moneyFormat, shortDateFormat, toUtcDate } from "./format";

function useMoneyTicks() {
  const format = useFormatter();
  return {
    tick: (value: number) => format.number(value, { notation: "compact", maximumFractionDigits: 1 }),
    money: (value: number) => format.number(value, moneyFormat("TWD")),
  };
}

/** Spending per day across a month. One series, so the title names it and there's no legend. */
export function MonthTrendChart({ data }: { data: TrendPoint[] }) {
  const t = useTranslations("finance");
  const format = useFormatter();
  const { tick, money } = useMoneyTicks();
  const points = data.map((point) => ({
    ...point,
    day: format.dateTime(toUtcDate(point.key), { day: "numeric", timeZone: "UTC" }),
    full: format.dateTime(toUtcDate(point.key), shortDateFormat),
  }));
  // The 1st, then every fifth day, so the labels are evenly spaced at any width.
  const ticks = points.filter((_, index) => index === 0 || (index + 1) % 5 === 0).map((point) => point.day);

  return (
    <div className="flex flex-col gap-2">
      <div className="h-48 w-full" role="img" aria-label={t("monthChartAlt")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" ticks={ticks} interval={0} tick={AXIS_TEXT} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis width={44} tick={AXIS_TEXT} tickLine={false} axisLine={false} tickFormatter={tick} allowDecimals={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "rgb(232 228 220 / 6%)" }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ""}
              formatter={(value) => [money(Number(value)), t("expense")]}
            />
            <Bar dataKey="expense" fill={EXPENSE_COLOR} maxBarSize={BAR_MAX_WIDTH} radius={BAR_RADIUS} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        headers={[t("date"), t("income"), t("expense"), t("net")]}
        rows={points.filter((point) => point.income || point.expense).map((point) => [point.full, money(point.income), money(point.expense), money(point.net)])}
      />
    </div>
  );
}

/** Income against spending for each month of a year. */
export function YearTrendChart({ data }: { data: TrendPoint[] }) {
  const t = useTranslations("finance");
  const format = useFormatter();
  const { tick, money } = useMoneyTicks();
  const points = data.map((point) => ({
    ...point,
    month: format.dateTime(toUtcDate(`${point.key}-01`), { month: "short", timeZone: "UTC" }),
  }));
  const incomeLabel = t("income");
  const expenseLabel = t("expense");

  return (
    <div className="flex flex-col gap-2">
      <Legend
        items={[
          { label: incomeLabel, color: INCOME_COLOR },
          { label: expenseLabel, color: EXPENSE_COLOR },
        ]}
      />
      <div className="h-56 w-full" role="img" aria-label={t("yearChartAlt")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tick={AXIS_TEXT} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={8} />
            <YAxis width={44} tick={AXIS_TEXT} tickLine={false} axisLine={false} tickFormatter={tick} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgb(232 228 220 / 6%)" }} formatter={(value) => money(Number(value))} />
            <Bar dataKey="income" name={incomeLabel} fill={INCOME_COLOR} maxBarSize={BAR_MAX_WIDTH} radius={BAR_RADIUS} isAnimationActive={false} />
            <Bar dataKey="expense" name={expenseLabel} fill={EXPENSE_COLOR} maxBarSize={BAR_MAX_WIDTH} radius={BAR_RADIUS} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView
        headers={[t("month"), incomeLabel, expenseLabel, t("net")]}
        rows={points.map((point) => [point.month, money(point.income), money(point.expense), money(point.net)])}
      />
    </div>
  );
}

/** What the portfolio was worth each day, against what it cost. Both in TWD, on one axis. */
export function ValueHistoryChart({ data }: { data: PortfolioSnapshot[] }) {
  const t = useTranslations("finance");
  const format = useFormatter();
  const { tick, money } = useMoneyTicks();
  const points = data.map((point) => ({ ...point, day: format.dateTime(toUtcDate(point.date), shortDateFormat) }));
  const valueLabel = t("marketValue");
  const costLabel = t("cost");

  return (
    <div className="flex flex-col gap-2">
      <Legend
        items={[
          { label: valueLabel, color: SERIES_COLORS[0] },
          { label: costLabel, color: SERIES_COLORS[1] },
        ]}
      />
      <div className="h-52 w-full" role="img" aria-label={t("valueChartAlt")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tick={AXIS_TEXT} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
            <YAxis width={48} tick={AXIS_TEXT} tickLine={false} axisLine={false} tickFormatter={tick} domain={["auto", "auto"]} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => money(Number(value))} />
            <Line
              type="monotone"
              dataKey="value_twd"
              name={valueLabel}
              stroke={SERIES_COLORS[0]}
              strokeWidth={2}
              dot={{ r: 4, fill: SERIES_COLORS[0], stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="cost_twd"
              name={costLabel}
              stroke={SERIES_COLORS[1]}
              strokeWidth={2}
              dot={{ r: 4, fill: SERIES_COLORS[1], stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TableView
        headers={[t("date"), valueLabel, costLabel]}
        rows={points.map((point) => [point.day, money(point.value_twd), money(point.cost_twd)])}
      />
    </div>
  );
}
