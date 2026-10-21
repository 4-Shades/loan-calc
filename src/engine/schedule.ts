import { assertIsoDate, paymentDate } from "./dates";
import { extraPaymentLookup, type ExtraPaymentImpact, type ExtraPayments } from "./extraPayments";
import { roundHalfUp } from "./money";
import { fixedPaymentCents, periodicRate, type FixedPaymentInput } from "./payment";

export interface ScheduleRow {
  period: number;
  /** Due date, YYYY-MM-DD. */
  date: string;
  paymentCents: number;
  principalCents: number;
  interestCents: number;
  feesCents: number;
  balanceCents: number;
}

export interface ScheduleSummary {
  regularPaymentCents: number;
  totalPaidCents: number;
  totalInterestCents: number;
  totalFeesCents: number;
  periods: number;
  /** Present when extra payments were specified (REQ-FUNC-PL03). */
  extraPaymentImpact?: ExtraPaymentImpact;
}

export interface Schedule {
  rows: ScheduleRow[];
  summary: ScheduleSummary;
}

export interface ScheduleInput extends FixedPaymentInput {
  /** Origination date, YYYY-MM-DD. The first payment falls one period later. */
  startDate: string;
}

export interface FixedScheduleInput extends ScheduleInput {
  extraPayments?: ExtraPayments;
}

/**
 * Amortization schedule for a fixed-rate installment loan (REQ-FUNC-PL01, AN01).
 *
 * Interest is charged on the outstanding balance each period and rounded to the
 * cent; the level payment covers it and the rest reduces principal. The last
 * payment settles whatever balance remains, absorbing accumulated rounding, so
 * principal sums exactly to the amount borrowed. If rounding the payment up, or
 * extra payments, clear the balance early, the schedule ends at that payoff.
 */
export function buildSchedule(input: FixedScheduleInput): Schedule {
  const regularPaymentCents = fixedPaymentCents(input);
  const { principalCents, aprPercent, periods, frequency, startDate, extraPayments } = input;
  const rate = periodicRate(aprPercent, frequency);
  const extraFor = extraPaymentLookup(extraPayments ?? {}, periods);
  assertIsoDate(startDate);

  // High-APR, long-term loans (e.g. 50% over 30 years) can have an exact payment less
  // than half a cent above the interest; rounded to the cent it never reduces principal.
  if (regularPaymentCents <= roundHalfUp(principalCents * rate)) {
    throw new RangeError(
      "Loan does not amortize: the payment does not exceed first-period interest at cent precision",
    );
  }

  const rows: ScheduleRow[] = [];
  let balanceCents = principalCents;

  for (let period = 1; period <= periods && balanceCents > 0; period++) {
    const interestCents = roundHalfUp(balanceCents * rate);
    const scheduledCents = regularPaymentCents + extraFor(period);
    const isPayoff = period === periods || scheduledCents >= balanceCents + interestCents;
    const paymentCents = isPayoff ? balanceCents + interestCents : scheduledCents;
    // Always positive: the check above guarantees it for period 1, and as the balance
    // falls the rounded interest can only fall too.
    const principalPaidCents = paymentCents - interestCents;

    balanceCents -= principalPaidCents;
    rows.push({
      period,
      date: paymentDate(startDate, frequency, period),
      paymentCents,
      principalCents: principalPaidCents,
      interestCents,
      feesCents: 0,
      balanceCents,
    });
  }

  const summary = summarizeRows(rows, regularPaymentCents);
  if (extraPayments) {
    const baseline = buildSchedule({ ...input, extraPayments: undefined });
    summary.extraPaymentImpact = {
      periodsSaved: baseline.summary.periods - summary.periods,
      interestSavedCents: baseline.summary.totalInterestCents - summary.totalInterestCents,
    };
  }
  return { rows, summary };
}

export function summarizeRows(rows: readonly ScheduleRow[], regularPaymentCents: number): ScheduleSummary {
  let totalPaidCents = 0;
  let totalInterestCents = 0;
  let totalFeesCents = 0;
  for (const row of rows) {
    totalPaidCents += row.paymentCents;
    totalInterestCents += row.interestCents;
    totalFeesCents += row.feesCents;
  }
  return { regularPaymentCents, totalPaidCents, totalInterestCents, totalFeesCents, periods: rows.length };
}
