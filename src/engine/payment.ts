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

export function assertValidLoan({ principalCents, aprPercent, periods }: FixedPaymentInput): void {
  if (!Number.isInteger(principalCents) || principalCents <= 0) {
    throw new RangeError(`Principal must be a positive whole number of cents, got ${principalCents}`);
  }
  if (!Number.isFinite(aprPercent) || aprPercent < 0) {
    throw new RangeError(`APR must be a non-negative percentage, got ${aprPercent}`);
  }
  if (!Number.isInteger(periods) || periods < 1) {
    throw new RangeError(`Periods must be a positive whole number, got ${periods}`);
  }
}

/** Level payment that amortizes the principal over the given periods (standard PMT), in cents. */
export function fixedPaymentCents(input: FixedPaymentInput): number {
  assertValidLoan(input);
  const { principalCents, aprPercent, periods, frequency } = input;
  const rate = periodicRate(aprPercent, frequency);
  if (rate === 0) {
    return roundHalfUp(principalCents / periods);
  }
  return roundHalfUp((principalCents * rate) / (1 - Math.pow(1 + rate, -periods)));
}
