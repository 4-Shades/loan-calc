import { describe, expect, it } from "vitest";
import { calculateLoan } from "@/lib/calculateLoan";
import { toStoredSummary } from "@/lib/storedSummary";
import { loanInputSchema } from "@/schemas/loanInput";
import { storedSummarySchema } from "@/schemas/saveCalculation";

function summaryFor(raw: unknown) {
  const input = loanInputSchema.parse(raw);
  const outcome = calculateLoan(input);
  if (!outcome.ok) throw new Error(outcome.error);
  return toStoredSummary(input, outcome.result);
}

const base = { aprPercent: 5, frequency: "monthly", startDate: "2026-01-15" } as const;

describe("toStoredSummary (summary_results JSONB)", () => {
  it("stores the headline figures of a fixed-rate loan, with no effective APR", () => {
    expect(
      summaryFor({ ...base, loanType: "FIXED_INSTALLMENT", principal: 10_000, term: { value: 24, unit: "months" } }),
    ).toEqual({
      category: "PERSONAL",
      loanAmountCents: 1_000_000,
      regularPaymentCents: 43_871,
      monthlyPaymentCents: 43_871,
      totalInterestCents: 52_915,
      totalFeesCents: 0,
      totalPaidCents: 1_052_915,
      periods: 24,
      effectiveAprPercent: null,
    });
  });

  it("stores an MCA's advance, finance charge and effective APR", () => {
    const summary = summaryFor({
      loanType: "MCA",
      advance: 50_000,
      factorRate: 1.25,
      frequency: "daily",
      repayment: { kind: "fixedTerm", termMonths: 6 },
      startDate: "2026-01-15",
    });
    expect(summary).toMatchObject({
      category: "BUSINESS",
      loanAmountCents: 5_000_000,
      totalFeesCents: 1_250_000,
      totalPaidCents: 6_250_000,
    });
    expect(summary.effectiveAprPercent).toBeCloseTo(92.219, 2);
    // 21 business-day withdrawals of $496.03 a month, so it compares with monthly loans.
    expect(summary.monthlyPaymentCents).toBe(49_603 * 21);
  });

  it("uses the financed amount for equipment loans", () => {
    expect(
      summaryFor({
        ...base,
        loanType: "EQUIPMENT",
        purchasePrice: 150_000,
        downPayment: { kind: "flat", value: 30_000 },
        residualValue: 15_000,
        aprPercent: 6.5,
        term: { value: 48, unit: "months" },
      }).loanAmountCents,
    ).toBe(12_000_000);
  });

  it("converts weekly payments to a monthly equivalent (52 / 12 per month)", () => {
    const summary = summaryFor({ ...base, loanType: "FIXED_INSTALLMENT", principal: 10_000, term: { value: 24, unit: "months" }, frequency: "weekly" });
    expect(summary.monthlyPaymentCents).toBe(Math.round((summary.regularPaymentCents * 52) / 12));
  });

  it("produces data that the stored-summary schema accepts", () => {
    const summary = summaryFor({ loanType: "REVOLVING", balance: 8_000, aprPercent: 18, minimumPaymentPercent: 2.5, startDate: "2026-01-15" });
    expect(storedSummarySchema.parse(summary)).toEqual(summary);
  });
});
