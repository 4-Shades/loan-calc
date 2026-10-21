const MAX_BRACKET_RATE = 1e6;
const BISECTION_STEPS = 200;

/**
 * Internal rate of return per period for evenly spaced cash flows, where
 * `cashFlows[0]` is the amount received (negative, from the lender's side) and the
 * rest are repayments (non-negative). For such conventional flows NPV falls
 * strictly as the rate rises, so the IRR is unique and bisection always converges.
 */
export function periodicIrr(cashFlows: readonly number[]): number {
  const [outflow, ...inflows] = cashFlows;
  if (outflow === undefined || !cashFlows.every(Number.isFinite)) {
    throw new RangeError("Cash flows must be finite numbers");
  }
  if (outflow >= 0 || inflows.some((flow) => flow < 0) || !inflows.some((flow) => flow > 0)) {
    throw new RangeError("Cash flows must be one outflow followed by non-negative repayments");
  }

  const npv = (rate: number) => {
    let total = outflow;
    let discount = 1;
    for (const flow of inflows) {
      discount /= 1 + rate;
      total += flow * discount;
    }
    return total;
  };

  // NPV → +∞ as rate → -1 (there is at least one repayment), so start just above -1.
  let low = -1 + 1e-9;
  let high = 1;
  while (npv(high) > 0) {
    high *= 2;
    if (high > MAX_BRACKET_RATE) {
      throw new RangeError("IRR did not converge: rate exceeds 100,000,000% per period");
    }
  }
  for (let step = 0; step < BISECTION_STEPS && high - low > 1e-15; step++) {
    const mid = (low + high) / 2;
    if (npv(mid) > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * True Effective APR (REQ-FUNC-BL03, D10): the nominal annual rate, i.e. the
 * periodic IRR of net proceeds against repayments × periods per year, as in Reg Z
 * and state commercial-financing disclosures. Not compounded.
 */
export function effectiveAprPercent(
  netProceedsCents: number,
  paymentsCents: readonly number[],
  periodsPerYear: number,
): number {
  if (!(netProceedsCents > 0)) {
    throw new RangeError(`Net proceeds must be positive, got ${netProceedsCents}`);
  }
  if (!(periodsPerYear > 0)) {
    throw new RangeError(`Periods per year must be positive, got ${periodsPerYear}`);
  }
  return periodicIrr([-netProceedsCents, ...paymentsCents]) * periodsPerYear * 100;
}
