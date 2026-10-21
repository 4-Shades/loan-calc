export interface OneTimeExtraPayment {
  /** Payment period (1-based) the extra is paid with. */
  period: number;
  amountCents: number;
}

/** Extra principal paid on top of the scheduled payment (REQ-FUNC-PL02, PL03). */
export interface ExtraPayments {
  /** Added to every scheduled payment, i.e. once per payment period. */
  recurringCents?: number;
  oneTime?: readonly OneTimeExtraPayment[];
}

export interface ExtraPaymentImpact {
  /** Payment periods saved versus the same loan without extras. */
  periodsSaved: number;
  interestSavedCents: number;
}

/** Validates the extras and returns the total extra principal due in a given period. */
export function extraPaymentLookup(extra: ExtraPayments, periods: number): (period: number) => number {
  const recurringCents = extra.recurringCents ?? 0;
  if (!Number.isInteger(recurringCents) || recurringCents < 0) {
    throw new RangeError(`Recurring extra payment must be a non-negative whole number of cents, got ${recurringCents}`);
  }

  const oneTimeByPeriod = new Map<number, number>();
  for (const { period, amountCents } of extra.oneTime ?? []) {
    if (!Number.isInteger(period) || period < 1 || period > periods) {
      throw new RangeError(`One-time extra payment period must be between 1 and ${periods}, got ${period}`);
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new RangeError(`One-time extra payment must be a positive whole number of cents, got ${amountCents}`);
    }
    oneTimeByPeriod.set(period, (oneTimeByPeriod.get(period) ?? 0) + amountCents);
  }

  return (period) => recurringCents + (oneTimeByPeriod.get(period) ?? 0);
}
