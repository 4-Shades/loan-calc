import { describe, expect, it } from "vitest";
import { buildEquipmentLoan, type EquipmentLoanInput } from "@/engine/business/equipment";

const loan = (overrides: Partial<EquipmentLoanInput> = {}): EquipmentLoanInput => ({
  purchasePriceCents: 15_000_000,
  downPayment: { kind: "flat", amountCents: 3_000_000 },
  residualCents: 1_500_000,
  aprPercent: 6.5,
  periods: 48,
  frequency: "monthly",
  startDate: "2026-01-15",
  ...overrides,
});

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("buildEquipmentLoan (REQ-FUNC-BL01 #2, decision D9)", () => {
  // "Equipment financing with down payment and residual value" in features/business_loans.feature
  describe("BDD: $150,000 equipment, $30,000 down, $15,000 residual, 6.5% over 48 months", () => {
    const { rows, summary } = buildEquipmentLoan(loan());

    it("finances the purchase price less the down payment", () => {
      expect(summary.downPaymentCents).toBe(3_000_000);
      expect(summary.financedCents).toBe(12_000_000);
      expect(sum(rows.map((r) => r.principalCents))).toBe(12_000_000);
    });

    it("sizes level payments to leave the residual as a final balloon", () => {
      expect(summary.regularPaymentCents).toBe(257_132);
      expect(rows).toHaveLength(48);
      expect(rows.at(-2)?.paymentCents).toBe(257_132);
      expect(rows.at(-2)?.balanceCents).toBeGreaterThan(1_500_000);
    });

    it("accounts for the $15,000 residual in the final balloon payment", () => {
      expect(summary.balloonCents).toBe(1_500_000);
      // Regular payment + $15,000 residual + 5¢ of accumulated rounding.
      expect(rows.at(-1)).toMatchObject({ period: 48, paymentCents: 1_757_137, balanceCents: 0 });
    });

    it("reports totals and an effective APR equal to the stated rate", () => {
      expect(summary.totalInterestCents).toBe(1_842_341);
      expect(summary.effectiveAprPercent).toBeCloseTo(6.5, 3);
    });
  });

  it("accepts the down payment as a percentage of the price", () => {
    expect(buildEquipmentLoan(loan({ downPayment: { kind: "percent", percent: 20 } }))).toEqual(buildEquipmentLoan(loan()));
  });

  it("fully amortizes when there is no residual", () => {
    const { rows, summary } = buildEquipmentLoan(loan({ residualCents: 0 }));
    expect(summary.regularPaymentCents).toBe(284_579);
    expect(rows.at(-1)?.paymentCents).toBeLessThan(284_579 + 100);
  });

  it("allows no down payment", () => {
    const { summary } = buildEquipmentLoan(loan({ downPayment: { kind: "flat", amountCents: 0 } }));
    expect(summary.financedCents).toBe(15_000_000);
  });

  it.each([
    ["a down payment equal to the price", { downPayment: { kind: "flat", amountCents: 15_000_000 } as const }],
    ["a residual equal to the financed amount", { residualCents: 12_000_000 }],
    ["a negative residual", { residualCents: -1 }],
    ["a non-positive price", { purchasePriceCents: 0 }],
  ])("rejects %s", (_label, override) => {
    expect(() => buildEquipmentLoan(loan(override))).toThrow(RangeError);
  });
});
