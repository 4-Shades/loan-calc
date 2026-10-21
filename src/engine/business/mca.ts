import { addBusinessDays, assertIsoDate, paymentDate } from "../dates";
import { roundHalfUp } from "../money";
import { summarizeRows, type ScheduleRow } from "../schedule";
import { withUpfrontFees, type BusinessSchedule, type BusinessSummary, type UpfrontFee } from "./fees";

export type McaFrequency = "daily" | "weekly" | "monthly";

/** Daily withdrawals are business days: 252 a year, 21 a month (D10). */
export const MCA_PERIODS_PER_YEAR: Readonly<Record<McaFrequency, number>> = { daily: 252, weekly: 52, monthly: 12 };

export const MCA_FACTOR_RATE_RANGE = { min: 1.05, max: 1.5 } as const;

/** Longest repayment accepted, so a tiny revenue share cannot produce an endless schedule. */
const MAX_MCA_YEARS = 10;

export type McaRepayment =
  /** Payback spread evenly over a fixed term. */
  | { kind: "fixedTerm"; termMonths: number }
  /** Each withdrawal is a percentage of revenue for that period; the term follows (REQ-FUNC-BL02). */
  | { kind: "revenueShare"; holdbackPercent: number; revenueCentsPerPeriod: number };

export interface McaInput {
  advanceCents: number;
  /** Payback = advance × factor rate, e.g. 1.25. */
  factorRate: number;
  frequency: McaFrequency;
  repayment: McaRepayment;
  startDate: string;
  /** Percentages are of the advance. */
  fees?: readonly UpfrontFee[];
}

export interface McaSummary extends BusinessSummary {
  totalPaybackCents: number;
  /** Payback less the advance; excludes upfront fees. */
  financeChargeCents: number;
}

/**
 * Merchant cash advance / factor-rate financing (REQ-FUNC-BL01 #3, BL03).
 *
 * MCAs charge a fixed factor rather than interest, so each withdrawal is split pro
 * rata into principal and finance charge (shown as fees, with zero interest). The
 * effective APR is the nominal IRR of the net advance against the withdrawals (D10).
 */
export function buildMerchantCashAdvance(input: McaInput): BusinessSchedule<McaSummary> {
  const { advanceCents, factorRate, frequency, repayment, startDate, fees } = input;
  if (!Number.isInteger(advanceCents) || advanceCents <= 0) {
    throw new RangeError(`Advance must be a positive whole number of cents, got ${advanceCents}`);
  }
  if (!(factorRate >= MCA_FACTOR_RATE_RANGE.min && factorRate <= MCA_FACTOR_RATE_RANGE.max)) {
    throw new RangeError(
      `Factor rate must be between ${MCA_FACTOR_RATE_RANGE.min} and ${MCA_FACTOR_RATE_RANGE.max}, got ${factorRate}`,
    );
  }
  assertIsoDate(startDate);

  const paybackCents = roundHalfUp(advanceCents * factorRate);
  const financeChargeCents = paybackCents - advanceCents;
  const { count, paymentCents } = withdrawalPlan(paybackCents, frequency, repayment);
  const finalPaymentCents = paybackCents - paymentCents * (count - 1);
  if (finalPaymentCents <= 0) {
    throw new RangeError("Advance is too small to split across that many withdrawals");
  }

  const rows: ScheduleRow[] = [];
  let paidCents = 0;
  let chargeAllocatedCents = 0;
  for (let period = 1; period <= count; period++) {
    const withdrawalCents = period === count ? finalPaymentCents : paymentCents;
    paidCents += withdrawalCents;
    // Allocate the charge on cumulative payments so the rounding never drifts.
    const chargeCents = roundHalfUp((paidCents * financeChargeCents) / paybackCents) - chargeAllocatedCents;
    chargeAllocatedCents += chargeCents;
    rows.push({
      period,
      date: frequency === "daily" ? addBusinessDays(startDate, period) : paymentDate(startDate, frequency, period),
      paymentCents: withdrawalCents,
      principalCents: withdrawalCents - chargeCents,
      interestCents: 0,
      feesCents: chargeCents,
      balanceCents: advanceCents - (paidCents - chargeAllocatedCents),
    });
  }

  const { rows: allRows, summary } = withUpfrontFees(
    { rows, summary: summarizeRows(rows, paymentCents) },
    { principalCents: advanceCents, fees, startDate, periodsPerYear: MCA_PERIODS_PER_YEAR[frequency] },
  );
  return { rows: allRows, summary: { ...summary, totalPaybackCents: paybackCents, financeChargeCents } };
}

function withdrawalPlan(
  paybackCents: number,
  frequency: McaFrequency,
  repayment: McaRepayment,
): { count: number; paymentCents: number } {
  const periodsPerYear = MCA_PERIODS_PER_YEAR[frequency];

  if (repayment.kind === "fixedTerm") {
    const { termMonths } = repayment;
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > MAX_MCA_YEARS * 12) {
      throw new RangeError(`Term must be 1 to ${MAX_MCA_YEARS * 12} whole months, got ${termMonths}`);
    }
    const count = Math.round((termMonths * periodsPerYear) / 12);
    return { count, paymentCents: roundHalfUp(paybackCents / count) };
  }

  const { holdbackPercent, revenueCentsPerPeriod } = repayment;
  if (!(holdbackPercent > 0 && holdbackPercent <= 100)) {
    throw new RangeError(`Holdback must be above 0% and at most 100%, got ${holdbackPercent}`);
  }
  if (!Number.isInteger(revenueCentsPerPeriod) || revenueCentsPerPeriod <= 0) {
    throw new RangeError(`Revenue must be a positive whole number of cents, got ${revenueCentsPerPeriod}`);
  }
  const paymentCents = roundHalfUp((revenueCentsPerPeriod * holdbackPercent) / 100);
  const count = paymentCents > 0 ? Math.ceil(paybackCents / paymentCents) : Infinity;
  if (count > MAX_MCA_YEARS * periodsPerYear) {
    throw new RangeError(`Revenue share would take more than ${MAX_MCA_YEARS} years to repay`);
  }
  return { count, paymentCents };
}
