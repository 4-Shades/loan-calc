import { describe, expect, it } from "vitest";
import { buildMerchantCashAdvance, type McaInput } from "@/engine/business/mca";

const advance = (overrides: Partial<McaInput> = {}): McaInput => ({
  advanceCents: 5_000_000,
  factorRate: 1.25,
  frequency: "daily",
  repayment: { kind: "fixedTerm", termMonths: 6 },
  startDate: "2026-01-15",
  ...overrides,
});

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("buildMerchantCashAdvance (REQ-FUNC-BL01 #3, BL03, decision D10)", () => {
  // "Merchant Cash Advance (MCA) Factor Rate and Effective APR computation" in features/business_loans.feature
  describe("BDD: $50,000 at factor 1.25 over 6 months with daily withholdings", () => {
    const { rows, summary } = buildMerchantCashAdvance(advance());

    it("totals $62,500.00 of payback", () => {
      expect(summary.totalPaybackCents).toBe(6_250_000);
      expect(sum(rows.map((r) => r.paymentCents))).toBe(6_250_000);
    });

    it("charges a $12,500.00 finance charge", () => {
      expect(summary.financeChargeCents).toBe(1_250_000);
      expect(summary.totalFeesCents).toBe(1_250_000);
      expect(summary.totalInterestCents).toBe(0);
    });

    it("reports an effective APR exceeding 45% (92.22% nominal, 252 business days)", () => {
      expect(summary.effectiveAprPercent).toBeGreaterThan(45);
      expect(summary.effectiveAprPercent).toBeCloseTo(92.219, 2);
    });

    it("withholds 126 business-day payments of $496.03, settling rounding in the last", () => {
      expect(rows).toHaveLength(126);
      expect(summary.regularPaymentCents).toBe(49_603);
      expect(rows.at(-1)?.paymentCents).toBe(49_625);
      expect(rows.slice(0, 3).map((r) => r.date)).toEqual(["2026-01-16", "2026-01-19", "2026-01-20"]);
      expect(rows.at(-1)?.date).toBe("2026-07-10");
    });

    it("splits each withholding pro rata into principal and finance charge", () => {
      expect(rows[0]).toMatchObject({ paymentCents: 49_603, principalCents: 39_682, feesCents: 9_921, interestCents: 0 });
      expect(rows.at(-1)).toMatchObject({ principalCents: 39_700, feesCents: 9_925, balanceCents: 0 });
      expect(sum(rows.map((r) => r.principalCents))).toBe(5_000_000);
      for (const row of rows) {
        expect(row.principalCents + row.feesCents).toBe(row.paymentCents);
      }
    });
  });

  it.each([
    ["weekly", 26, 240_385, 89.8974],
    ["monthly", 6, 1_041_667, 81.2862],
  ] as const)("supports %s withholdings", (frequency, count, payment, apr) => {
    const { rows, summary } = buildMerchantCashAdvance(advance({ frequency }));
    expect(rows).toHaveLength(count);
    expect(summary.regularPaymentCents).toBe(payment);
    expect(summary.effectiveAprPercent).toBeCloseTo(apr, 2);
  });

  it("derives the term from a revenue holdback percentage (REQ-FUNC-BL02)", () => {
    // $20,000 at 1.2 = $24,000 payback; 10% of $5,000 daily revenue = $500/day → 48 business days.
    const { rows, summary } = buildMerchantCashAdvance(
      advance({
        advanceCents: 2_000_000,
        factorRate: 1.2,
        repayment: { kind: "revenueShare", holdbackPercent: 10, revenueCentsPerPeriod: 500_000 },
      }),
    );
    expect(rows).toHaveLength(48);
    expect(summary.regularPaymentCents).toBe(50_000);
    expect(summary.totalPaybackCents).toBe(2_400_000);
    expect(summary.effectiveAprPercent).toBeCloseTo(194.0771, 2);
  });

  it("withholds upfront fees from the advance and counts them in the effective APR", () => {
    const { rows, summary } = buildMerchantCashAdvance(
      advance({ fees: [{ label: "Origination", amount: { kind: "flat", amountCents: 100_000 } }] }),
    );
    expect(rows[0]).toMatchObject({ period: 0, feesCents: 100_000 });
    expect(summary.netProceedsCents).toBe(4_900_000);
    expect(summary.financeChargeCents).toBe(1_250_000);
    expect(summary.totalFeesCents).toBe(1_350_000);
    expect(summary.effectiveAprPercent).toBeCloseTo(100.9612, 2);
  });

  it.each([1.05, 1.5])("accepts the factor rate bound %d", (factorRate) => {
    expect(() => buildMerchantCashAdvance(advance({ factorRate }))).not.toThrow();
  });

  it.each([
    ["factor rate 1.04", { factorRate: 1.04 }],
    ["factor rate 1.51", { factorRate: 1.51 }],
    ["a zero advance", { advanceCents: 0 }],
    ["a zero-month term", { repayment: { kind: "fixedTerm", termMonths: 0 } as const }],
    ["a zero holdback", { repayment: { kind: "revenueShare", holdbackPercent: 0, revenueCentsPerPeriod: 500_000 } as const }],
    ["a holdback over 100%", { repayment: { kind: "revenueShare", holdbackPercent: 101, revenueCentsPerPeriod: 500_000 } as const }],
    ["zero revenue", { repayment: { kind: "revenueShare", holdbackPercent: 10, revenueCentsPerPeriod: 0 } as const }],
    ["a holdback that rounds to a zero withdrawal", { repayment: { kind: "revenueShare", holdbackPercent: 10, revenueCentsPerPeriod: 1 } as const }],
    ["a revenue share longer than 10 years", { repayment: { kind: "revenueShare", holdbackPercent: 1, revenueCentsPerPeriod: 1_000 } as const }],
    ["an advance too small to split across 126 withdrawals", { advanceCents: 100 }],
    ["a term over 10 years", { repayment: { kind: "fixedTerm", termMonths: 121 } as const }],
  ])("rejects %s", (_label, override) => {
    expect(() => buildMerchantCashAdvance(advance(override))).toThrow(RangeError);
  });
});
