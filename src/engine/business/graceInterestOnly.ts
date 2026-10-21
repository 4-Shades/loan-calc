import { paymentDate } from "../dates";
import { roundHalfUp } from "../money";
import { assertValidLoan, periodicRate, PERIODS_PER_YEAR } from "../payment";
import { buildSchedule, summarizeRows, type ScheduleInput, type ScheduleRow } from "../schedule";
import { withUpfrontFees, type BusinessSchedule, type UpfrontFee } from "./fees";

export interface GracePeriodLoanInput extends ScheduleInput {
  /** Leading interest-only periods; the remaining periods amortize the principal. */
  gracePeriods: number;
  fees?: readonly UpfrontFee[];
}

/**
 * Interest-only grace period loan (REQ-FUNC-BL01 #4): interest-only payments for
 * the grace period, then the full principal amortizes over the remaining periods.
 * `summary.regularPaymentCents` is the post-grace amortizing payment.
 */
export function buildGracePeriodLoan({ gracePeriods, fees, ...loan }: GracePeriodLoanInput): BusinessSchedule {
  assertValidLoan(loan);
  const { principalCents, aprPercent, periods, frequency, startDate } = loan;
  if (!Number.isInteger(gracePeriods) || gracePeriods < 0 || gracePeriods >= periods) {
    throw new RangeError(`Grace period must be a whole number from 0 to ${periods - 1} periods, got ${gracePeriods}`);
  }

  const interestOnlyCents = roundHalfUp(principalCents * periodicRate(aprPercent, frequency));
  const graceRows: ScheduleRow[] = Array.from({ length: gracePeriods }, (_, i) => ({
    period: i + 1,
    date: paymentDate(startDate, frequency, i + 1),
    paymentCents: interestOnlyCents,
    principalCents: 0,
    interestCents: interestOnlyCents,
    feesCents: 0,
    balanceCents: principalCents,
  }));

  const amortizing = buildSchedule({ ...loan, periods: periods - gracePeriods });
  // Renumber and re-date from the original start so monthly dates keep the origination day.
  const amortizingRows = amortizing.rows.map((row) => {
    const period = row.period + gracePeriods;
    return { ...row, period, date: paymentDate(startDate, frequency, period) };
  });

  const rows = [...graceRows, ...amortizingRows];
  return withUpfrontFees(
    { rows, summary: summarizeRows(rows, amortizing.summary.regularPaymentCents) },
    { principalCents, fees, startDate, periodsPerYear: PERIODS_PER_YEAR[frequency] },
  );
}
