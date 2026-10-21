import { LoanCalculationError } from "../errors";
import { effectiveAprPercent } from "../irr";
import { roundHalfUp } from "../money";
import type { ScheduleRow, ScheduleSummary } from "../schedule";

/** An amount given either in cents or as a percentage of some base (REQ-FUNC-BL02). */
export type Amount = { kind: "flat"; amountCents: number } | { kind: "percent"; percent: number };

export interface UpfrontFee {
  label: string;
  /** Percentages are of the loan amount. */
  amount: Amount;
}

export interface BusinessSummary extends ScheduleSummary {
  upfrontFeesCents: number;
  /** Loan amount less fees withheld at closing: what the borrower actually receives. */
  netProceedsCents: number;
  effectiveAprPercent: number;
}

export interface BusinessSchedule<S extends BusinessSummary = BusinessSummary> {
  rows: ScheduleRow[];
  summary: S;
}

export function resolveAmountCents(amount: Amount, baseCents: number): number {
  if (amount.kind === "flat") {
    if (!Number.isInteger(amount.amountCents) || amount.amountCents < 0) {
      throw new RangeError(`Amount must be a non-negative whole number of cents, got ${amount.amountCents}`);
    }
    return amount.amountCents;
  }
  if (!Number.isFinite(amount.percent) || amount.percent < 0 || amount.percent > 100) {
    throw new RangeError(`Percentage must be between 0 and 100, got ${amount.percent}`);
  }
  return roundHalfUp((baseCents * amount.percent) / 100);
}

export function totalUpfrontFeesCents(fees: readonly UpfrontFee[] | undefined, loanCents: number): number {
  const total = (fees ?? []).reduce((sum, fee) => sum + resolveAmountCents(fee.amount, loanCents), 0);
  if (total >= loanCents) {
    throw new LoanCalculationError(
      "FEES_EXCEED_LOAN",
      `Upfront fees (${total}¢) must be less than the loan amount (${loanCents}¢)`,
    );
  }
  return total;
}

interface UpfrontFeeTerms {
  principalCents: number;
  fees: readonly UpfrontFee[] | undefined;
  startDate: string;
  periodsPerYear: number;
}

/**
 * Applies fees withheld from the proceeds at closing (D12): payments stay as
 * scheduled on the full principal, fees appear in a period-0 closing row, and the
 * effective APR is the IRR of the net proceeds against the scheduled payments.
 */
export function withUpfrontFees<S extends ScheduleSummary>(
  schedule: { rows: ScheduleRow[]; summary: S },
  { principalCents, fees, startDate, periodsPerYear }: UpfrontFeeTerms,
): BusinessSchedule<S & BusinessSummary> {
  const upfrontFeesCents = totalUpfrontFeesCents(fees, principalCents);
  const netProceedsCents = principalCents - upfrontFeesCents;
  const closingRow: ScheduleRow = {
    period: 0,
    date: startDate,
    paymentCents: upfrontFeesCents,
    principalCents: 0,
    interestCents: 0,
    feesCents: upfrontFeesCents,
    balanceCents: principalCents,
  };

  return {
    rows: upfrontFeesCents > 0 ? [closingRow, ...schedule.rows] : schedule.rows,
    summary: {
      ...schedule.summary,
      totalPaidCents: schedule.summary.totalPaidCents + upfrontFeesCents,
      totalFeesCents: schedule.summary.totalFeesCents + upfrontFeesCents,
      upfrontFeesCents,
      netProceedsCents,
      effectiveAprPercent: effectiveAprPercent(
        netProceedsCents,
        schedule.rows.map((row) => row.paymentCents),
        periodsPerYear,
      ),
    },
  };
}
