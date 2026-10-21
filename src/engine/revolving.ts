import { assertIsoDate, paymentDate } from "./dates";
import { roundHalfUp } from "./money";
import { periodicRate } from "./payment";
import { summarizeRows, type Schedule, type ScheduleRow } from "./schedule";

/** 100 years of monthly statements. */
export const DEFAULT_MAX_REVOLVING_PERIODS = 1_200;

export interface RevolvingInput {
  balanceCents: number;
  aprPercent: number;
  /** Minimum payment as a percentage of the outstanding balance, e.g. 2.5. */
  minimumPaymentPercent: number;
  /** Date of the opening balance, YYYY-MM-DD. Statements are monthly. */
  startDate: string;
  /** Stop after this many statements even if the balance is not cleared. */
  maxPeriods?: number;
}

export interface RevolvingSchedule extends Schedule {
  /** False when the period cap was reached with a balance still owed. */
  paidOff: boolean;
}

/**
 * Minimum-payment schedule for a revolving line of credit (REQ-FUNC-PL01 #3, D11).
 *
 * Each month the minimum is the given percentage of the outstanding balance
 * (before that month's interest), recomputed every period with no dollar floor.
 * Because the minimum shrinks with the balance, it can take decades to pay off;
 * once the rounded minimum would no longer reduce the balance by at least a cent,
 * the remaining balance is paid off so the schedule terminates.
 * `summary.regularPaymentCents` is the initial minimum payment.
 */
export function buildRevolvingSchedule(input: RevolvingInput): RevolvingSchedule {
  assertValidRevolving(input);
  const { balanceCents: openingBalanceCents, aprPercent, minimumPaymentPercent, startDate } = input;
  const maxPeriods = input.maxPeriods ?? DEFAULT_MAX_REVOLVING_PERIODS;
  const rate = periodicRate(aprPercent, "monthly");
  const minimumFor = (balanceCents: number) => roundHalfUp((balanceCents * minimumPaymentPercent) / 100);

  const initialMinimumCents = minimumFor(openingBalanceCents);
  if (initialMinimumCents <= roundHalfUp(openingBalanceCents * rate)) {
    throw new RangeError("Minimum payment does not cover interest: the balance would never decrease");
  }

  const rows: ScheduleRow[] = [];
  let balanceCents = openingBalanceCents;

  for (let period = 1; period <= maxPeriods && balanceCents > 0; period++) {
    const interestCents = roundHalfUp(balanceCents * rate);
    const minimumCents = minimumFor(balanceCents);
    const isPayoff = minimumCents - interestCents < 1 || minimumCents >= balanceCents + interestCents;
    const paymentCents = isPayoff ? balanceCents + interestCents : minimumCents;
    const principalPaidCents = paymentCents - interestCents;

    balanceCents -= principalPaidCents;
    rows.push({
      period,
      date: paymentDate(startDate, "monthly", period),
      paymentCents,
      principalCents: principalPaidCents,
      interestCents,
      feesCents: 0,
      balanceCents,
    });
  }

  return { rows, summary: summarizeRows(rows, initialMinimumCents), paidOff: balanceCents === 0 };
}

function assertValidRevolving({ balanceCents, aprPercent, minimumPaymentPercent, startDate, maxPeriods }: RevolvingInput) {
  if (!Number.isInteger(balanceCents) || balanceCents <= 0) {
    throw new RangeError(`Balance must be a positive whole number of cents, got ${balanceCents}`);
  }
  if (!Number.isFinite(aprPercent) || aprPercent < 0) {
    throw new RangeError(`APR must be a non-negative percentage, got ${aprPercent}`);
  }
  if (!Number.isFinite(minimumPaymentPercent) || minimumPaymentPercent <= 0 || minimumPaymentPercent > 100) {
    throw new RangeError(`Minimum payment must be above 0% and at most 100%, got ${minimumPaymentPercent}`);
  }
  if (maxPeriods !== undefined && (!Number.isInteger(maxPeriods) || maxPeriods < 1)) {
    throw new RangeError(`Period cap must be a positive whole number, got ${maxPeriods}`);
  }
  assertIsoDate(startDate);
}
