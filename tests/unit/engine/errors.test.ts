import { describe, expect, it } from "vitest";
import { LoanCalculationError, type LoanCalculationErrorCode } from "@/engine/errors";
import { buildSchedule } from "@/engine/schedule";
import { buildRevolvingSchedule } from "@/engine/revolving";
import { buildTermLoan } from "@/engine/business/term";
import { buildMerchantCashAdvance } from "@/engine/business/mca";

function codeOf(fn: () => unknown): LoanCalculationErrorCode | undefined {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LoanCalculationError);
    expect(error).toBeInstanceOf(RangeError);
    return (error as LoanCalculationError).code;
  }
  throw new Error("Expected the engine to throw");
}

describe("LoanCalculationError: inputs that are valid but cannot be calculated", () => {
  it("flags non-amortizing loans", () => {
    expect(
      codeOf(() =>
        buildSchedule({ principalCents: 10_000_000, aprPercent: 50, periods: 360, frequency: "monthly", startDate: "2026-01-15" }),
      ),
    ).toBe("NON_AMORTIZING");
  });

  it("flags revolving minimums that do not cover interest", () => {
    expect(
      codeOf(() =>
        buildRevolvingSchedule({ balanceCents: 800_000, aprPercent: 18, minimumPaymentPercent: 1, startDate: "2026-01-15" }),
      ),
    ).toBe("MINIMUM_BELOW_INTEREST");
  });

  it("flags fees that consume the loan", () => {
    expect(
      codeOf(() =>
        buildTermLoan({
          principalCents: 100_000,
          aprPercent: 5,
          periods: 12,
          frequency: "monthly",
          startDate: "2026-01-15",
          fees: [{ label: "Origination", amount: { kind: "flat", amountCents: 100_000 } }],
        }),
      ),
    ).toBe("FEES_EXCEED_LOAN");
  });

  it("flags MCAs that are too small or too slow", () => {
    const mca = { advanceCents: 10_000, factorRate: 1.5, frequency: "daily", startDate: "2026-01-15" } as const;
    expect(codeOf(() => buildMerchantCashAdvance({ ...mca, repayment: { kind: "fixedTerm", termMonths: 120 } }))).toBe(
      "ADVANCE_TOO_SMALL",
    );
    expect(
      codeOf(() =>
        buildMerchantCashAdvance({
          ...mca,
          // 1% of $1 = 1¢ a day against $150 of payback: 15,000 business days.
          repayment: { kind: "revenueShare", holdbackPercent: 1, revenueCentsPerPeriod: 100 },
        }),
      ),
    ).toBe("REPAYMENT_TOO_LONG");
  });
});
