import { MCA_PERIODS_PER_YEAR, PERIODS_PER_YEAR, roundHalfUp, toCents } from "@/engine";
import { categoryOf, type LoanInput } from "@/schemas/loanInput";
import type { StoredSummary } from "@/schemas/saveCalculation";
import type { CalculationResult } from "./calculateLoan";

/** The headline figures stored with a saved calculation (summary_results). */
export function toStoredSummary(input: LoanInput, result: CalculationResult): StoredSummary {
  const { summary } = result.schedule;
  return {
    category: categoryOf(input.loanType),
    loanAmountCents: loanAmountCents(input, result),
    regularPaymentCents: summary.regularPaymentCents,
    monthlyPaymentCents: roundHalfUp((summary.regularPaymentCents * paymentsPerYear(input)) / 12),
    totalInterestCents: summary.totalInterestCents,
    totalFeesCents: summary.totalFeesCents,
    totalPaidCents: summary.totalPaidCents,
    periods: summary.periods,
    effectiveAprPercent: "effectiveAprPercent" in summary ? summary.effectiveAprPercent : null,
  };
}

function loanAmountCents(input: LoanInput, result: CalculationResult): number {
  switch (input.loanType) {
    case "REVOLVING":
      return toCents(input.balance);
    case "MCA":
      return toCents(input.advance);
    case "EQUIPMENT":
      return result.loanType === "EQUIPMENT" ? result.schedule.summary.financedCents : 0;
    default:
      return toCents(input.principal);
  }
}

function paymentsPerYear(input: LoanInput): number {
  switch (input.loanType) {
    case "REVOLVING":
      return 12;
    case "MCA":
      return MCA_PERIODS_PER_YEAR[input.frequency];
    default:
      return PERIODS_PER_YEAR[input.frequency];
  }
}
