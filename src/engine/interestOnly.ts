import { assertIsoDate, paymentDate } from "./dates";
import { roundHalfUp } from "./money";
import { assertValidLoan, periodicRate } from "./payment";
import { summarizeRows, type Schedule, type ScheduleInput, type ScheduleRow } from "./schedule";

/**
 * Interest-only loan with a balloon payment (REQ-FUNC-PL01 #2): each period pays
 * only the interest on the unchanged principal, and the final period repays the
 * full principal along with its interest.
 */
export function buildInterestOnlySchedule(input: ScheduleInput): Schedule {
  assertValidLoan(input);
  const { principalCents, aprPercent, periods, frequency, startDate } = input;
  assertIsoDate(startDate);

  const interestCents = roundHalfUp(principalCents * periodicRate(aprPercent, frequency));
  const rows: ScheduleRow[] = [];

  for (let period = 1; period <= periods; period++) {
    const isBalloon = period === periods;
    const principalPaidCents = isBalloon ? principalCents : 0;
    rows.push({
      period,
      date: paymentDate(startDate, frequency, period),
      paymentCents: interestCents + principalPaidCents,
      principalCents: principalPaidCents,
      interestCents,
      feesCents: 0,
      balanceCents: principalCents - principalPaidCents,
    });
  }

  return { rows, summary: summarizeRows(rows, interestCents) };
}
