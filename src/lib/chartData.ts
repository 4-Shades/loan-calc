import type { ScheduleRow } from "@/engine";

export interface TimelinePoint {
  period: number;
  /** Due date; null for the opening point when the schedule has no closing row. */
  date: string | null;
  /** Dollars, cumulative. */
  principalPaid: number;
  /** Dollars, cumulative: interest plus fees (an MCA's factor charge is a fee). */
  interestAndFeesPaid: number;
  /** Dollars outstanding after this period. */
  balance: number;
}

/**
 * Cumulative principal vs. interest and the balance over time (REQ-FUNC-AN02),
 * starting from the opening balance. Long schedules are thinned to about
 * `maxPoints` (always keeping the first and last points) so charts stay fast.
 */
export function timelineSeries(rows: readonly ScheduleRow[], maxPoints = 120): TimelinePoint[] {
  const first = rows[0];
  if (!first) return [];

  const points: TimelinePoint[] = [];
  if (first.period !== 0) {
    points.push({
      period: 0,
      date: null,
      principalPaid: 0,
      interestAndFeesPaid: 0,
      balance: (first.balanceCents + first.principalCents) / 100,
    });
  }
  let principalCents = 0;
  let costCents = 0;
  for (const row of rows) {
    principalCents += row.principalCents;
    costCents += row.interestCents + row.feesCents;
    points.push({
      period: row.period,
      date: row.date,
      principalPaid: principalCents / 100,
      interestAndFeesPaid: costCents / 100,
      balance: row.balanceCents / 100,
    });
  }

  const step = Math.max(1, Math.ceil((points.length - 1) / maxPoints));
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

export interface BreakdownSlice {
  key: "principal" | "interest" | "fees";
  label: string;
  cents: number;
}

/** Where the money goes over the life of the loan (payment breakdown donut). */
export function paymentBreakdown(rows: readonly ScheduleRow[]): BreakdownSlice[] {
  let principal = 0;
  let interest = 0;
  let fees = 0;
  for (const row of rows) {
    principal += row.principalCents;
    interest += row.interestCents;
    fees += row.feesCents;
  }
  const slices: BreakdownSlice[] = [
    { key: "principal", label: "Principal", cents: principal },
    { key: "interest", label: "Interest", cents: interest },
    { key: "fees", label: "Fees", cents: fees },
  ];
  return slices.filter((slice) => slice.key === "principal" || slice.cents > 0);
}
