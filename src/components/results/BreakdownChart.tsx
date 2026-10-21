"use client";

import { useId } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ScheduleRow } from "@/engine";
import { paymentBreakdown, type BreakdownSlice } from "@/lib/chartData";
import { formatCents } from "@/lib/format";
import { useChartTheme, type ChartTheme } from "./chartTheme";

const SIZE = 200;

const sliceColor = (slice: BreakdownSlice, theme: ChartTheme) => theme.series[slice.key];

/**
 * Payment breakdown donut (REQ-FUNC-AN02): principal vs. interest vs. fees over
 * the life of the loan. Segments are separated by a 2px surface gap; every value
 * is also printed in the legend, so the chart never gates a number.
 */
export function BreakdownChart({ rows }: { rows: readonly ScheduleRow[] }) {
  const theme = useChartTheme();
  const titleId = useId();
  const slices = paymentBreakdown(rows);
  const total = slices.reduce((sum, slice) => sum + slice.cents, 0);
  const share = (cents: number) => `${((cents / total) * 100).toFixed(1)}%`;

  return (
    <figure aria-labelledby={titleId} className="flex flex-col gap-2">
      <figcaption id={titleId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Payment breakdown
      </figcaption>
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <ResponsiveContainer width={SIZE} height={SIZE} initialDimension={{ width: SIZE, height: SIZE }}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="cents"
              nameKey="label"
              innerRadius={62}
              outerRadius={92}
              startAngle={90}
              endAngle={-270}
              stroke={theme.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={sliceColor(slice, theme)} />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip share={share} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-zinc-500">Total paid</span>
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{formatCents(total)}</span>
        </div>
      </div>
      <ul aria-label="Legend" className="flex flex-col gap-1 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: sliceColor(slice, theme) }} />
            <span className="text-zinc-700 dark:text-zinc-300">{slice.label}</span>
            <span className="ml-auto font-medium tabular-nums text-zinc-900 dark:text-zinc-50">{formatCents(slice.cents)}</span>
            <span className="w-14 text-right tabular-nums text-zinc-500">{share(slice.cents)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

interface SliceTooltipProps {
  share: (cents: number) => string;
  active?: boolean;
  payload?: readonly { payload: BreakdownSlice }[];
}

function SliceTooltip({ share, active, payload }: SliceTooltipProps) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatCents(slice.cents)}</p>
      <p className="text-zinc-500">
        {slice.label} · {share(slice.cents)}
      </p>
    </div>
  );
}
