"use client";

import { useId } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScheduleRow } from "@/engine";
import { timelineSeries, type TimelinePoint } from "@/lib/chartData";
import { formatCents } from "@/lib/format";
import { formatCompactUsd, useChartTheme, type ChartTheme } from "./chartTheme";

const SERIES = [
  { key: "principalPaid", label: "Principal paid", color: (t: ChartTheme) => t.series.principal },
  { key: "interestAndFeesPaid", label: "Interest & fees paid", color: (t: ChartTheme) => t.series.interest },
  { key: "balance", label: "Remaining balance", color: (t: ChartTheme) => t.series.balance },
] as const;

const HEIGHT = 260;

/**
 * Cumulative principal vs. cumulative interest & fees, with the remaining balance,
 * over the life of the loan (REQ-FUNC-AN02). One dollar axis for all three series.
 */
export function BalanceChart({ rows }: { rows: readonly ScheduleRow[] }) {
  const theme = useChartTheme();
  const titleId = useId();
  const descriptionId = useId();
  const data = timelineSeries(rows);
  const end = data.at(-1);
  const payments = rows.filter((row) => row.period > 0).length;

  return (
    <figure aria-labelledby={titleId} aria-describedby={descriptionId} className="flex flex-col gap-2">
      <figcaption id={titleId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Balance and payments over time
      </figcaption>
      <Legend theme={theme} />
      <div style={{ height: HEIGHT }}>
        <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 600, height: HEIGHT }}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis
              dataKey="period"
              type="number"
              domain={[0, "dataMax"]}
              allowDecimals={false}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              stroke={theme.axis}
              height={40}
              label={{ value: "Payment number", position: "insideBottom", fill: theme.muted, fontSize: 12 }}
            />
            <YAxis
              tickFormatter={formatCompactUsd}
              width={64}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<TimelineTooltip theme={theme} />} cursor={{ stroke: theme.axis, strokeWidth: 1 }} />
            {SERIES.map((series) => (
              <Line
                key={series.key}
                dataKey={series.key}
                name={series.label}
                type="monotone"
                stroke={series.color(theme)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p id={descriptionId} className="sr-only">
        {end &&
          `After ${payments} payments: ${formatCents(Math.round(end.principalPaid * 100))} principal paid, ` +
            `${formatCents(Math.round(end.interestAndFeesPaid * 100))} interest and fees paid, ` +
            `${formatCents(Math.round(end.balance * 100))} remaining.`}
      </p>
    </figure>
  );
}

function Legend({ theme }: { theme: ChartTheme }) {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
      {SERIES.map((series) => (
        <li key={series.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded" style={{ background: series.color(theme) }} />
          {series.label}
        </li>
      ))}
    </ul>
  );
}

interface TooltipProps {
  theme: ChartTheme;
  active?: boolean;
  payload?: readonly { payload: TimelinePoint }[];
}

/** One readout for every series at the hovered payment; values lead, names follow. */
function TimelineTooltip({ theme, active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1 text-zinc-500">
        {point.period === 0 ? "Start" : `Payment ${point.period}`}
        {point.date ? ` · ${point.date}` : ""}
      </p>
      {SERIES.map((series) => (
        <p key={series.key} className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded" style={{ background: series.color(theme) }} />
          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatCents(Math.round(point[series.key] * 100))}
          </span>
          <span className="text-zinc-500">{series.label}</span>
        </p>
      ))}
    </div>
  );
}
