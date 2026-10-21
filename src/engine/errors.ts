export type LoanCalculationErrorCode =
  | "NON_AMORTIZING"
  | "MINIMUM_BELOW_INTEREST"
  | "FEES_EXCEED_LOAN"
  | "ADVANCE_TOO_SMALL"
  | "REPAYMENT_TOO_LONG";

/**
 * Inputs that are individually valid but cannot produce a schedule together
 * (e.g. 50% APR over 30 years). Callers can show these to the user; any other
 * RangeError from the engine means validation let bad input through.
 */
export class LoanCalculationError extends RangeError {
  constructor(
    readonly code: LoanCalculationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LoanCalculationError";
  }
}
