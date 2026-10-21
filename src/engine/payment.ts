import { roundHalfUp } from "./money";

export type PaymentFrequency = "weekly" | "biweekly" | "monthly" | "annually";

export const PERIODS_PER_YEAR: Readonly<Record<PaymentFrequency, number>> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  annually: 1,
};

export interface FixedPaymentInput {
  principalCents: number;
  aprPercent: number;
  periods: number;
  frequency: PaymentFrequency;
  /** Balance left to repay as a balloon with the final payment (e.g. equipment residual). */
  balloonCents?: number;
}

/** Nominal rate per payment period, e.g. 6% APR paid monthly → 0.005. */
export function periodicRate(aprPercent: number, frequency: PaymentFrequency): number {
  return aprPercent / 100 / PERIODS_PER_YEAR[frequency];
}

/** Number of payments in a term given in months, rounded to the nearest whole period. */
export function periodsForTerm(termMonths: number, frequency: PaymentFrequency): number {
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new RangeError(`Term must be a positive whole number of months, got ${termMonths}`);
  }
  const periods = Math.round((termMonths * PERIODS_PER_YEAR[frequency]) / 12);
  if (periods < 1) {
    throw new RangeError(`A ${termMonths}-month term is shorter than one ${frequency} payment period`);
  }
  return periods;
}

export function assertValidLoan({ principalCents, aprPercent, periods, balloonCents = 0 }: FixedPaymentInput): void {
  if (!Number.isInteger(principalCents) || principalCents <= 0) {
    throw new RangeError(`Principal must be a positive whole number of cents, got ${principalCents}`);
  }
  if (!Number.isFinite(aprPercent) || aprPercent < 0) {
    throw new RangeError(`APR must be a non-negative percentage, got ${aprPercent}`);
  }
  if (!Number.isInteger(periods) || periods < 1) {
    throw new RangeError(`Periods must be a positive whole number, got ${periods}`);
  }
  if (!Number.isInteger(balloonCents) || balloonCents < 0 || balloonCents >= principalCents) {
    throw new RangeError(`Balloon must be a whole number of cents below the principal, got ${balloonCents}`);
  }
}

/**
 * Level payment that amortizes the principal over the given periods (standard PMT),
 * in cents. With a balloon, the payment is sized so that balance remains at the end.
 */
export function fixedPaymentCents(input: FixedPaymentInput): number {
  assertValidLoan(input);
  const { principalCents, aprPercent, periods, frequency, balloonCents = 0 } = input;
  const rate = periodicRate(aprPercent, frequency);
  if (rate === 0) {
    return roundHalfUp((principalCents - balloonCents) / periods);
  }
  const discount = Math.pow(1 + rate, -periods);
  return roundHalfUp(((principalCents - balloonCents * discount) * rate) / (1 - discount));
}
