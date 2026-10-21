import { describe, expect, it } from "vitest";
import { buildTermLoan, type TermLoanInput } from "@/engine/business/term";

const loan = (overrides: Partial<TermLoanInput> = {}): TermLoanInput => ({
  principalCents: 10_000_000,
  aprPercent: 7.5,
  periods: 120,
  frequency: "monthly",
  startDate: "2026-01-15",
  ...overrides,
});

const sbaFees: TermLoanInput["fees"] = [
  { label: "Origination", amount: { kind: "percent", percent: 2 } },
  { label: "SBA guarantee", amount: { kind: "flat", amountCents: 150_000 } },
];

describe("buildTermLoan: traditional term / SBA (REQ-FUNC-BL01 #1, D12)", () => {
  describe("$100,000 at 7.5% over 10 years with $3,500 of fees", () => {
    const { rows, summary } = buildTermLoan(loan({ fees: sbaFees }));

    it("withholds fees from the proceeds in a period-0 closing row", () => {
      expect(rows[0]).toEqual({
        period: 0,
        date: "2026-01-15",
        paymentCents: 350_000,
        principalCents: 0,
        interestCents: 0,
        feesCents: 350_000,
        balanceCents: 10_000_000,
      });
      expect(summary.upfrontFeesCents).toBe(350_000);
      expect(summary.netProceedsCents).toBe(9_650_000);
    });

    it("computes payments on the full loan amount", () => {
      expect(summary.regularPaymentCents).toBe(118_702);
      expect(rows[1]).toMatchObject({ period: 1, date: "2026-02-15", paymentCents: 118_702, feesCents: 0 });
      expect(rows).toHaveLength(121);
      expect(rows.at(-1)).toMatchObject({ period: 120, paymentCents: 118_663, balanceCents: 0 });
    });

    it("includes fees in the totals", () => {
      expect(summary.totalInterestCents).toBe(4_244_201);
      expect(summary.totalFeesCents).toBe(350_000);
      expect(summary.totalPaidCents).toBe(10_000_000 + 4_244_201 + 350_000);
      expect(summary.periods).toBe(120);
    });

    it("reports an effective APR above the stated rate (REQ-FUNC-BL03)", () => {
      expect(summary.effectiveAprPercent).toBeCloseTo(8.3166, 3);
    });
  });

  it("has an effective APR equal to the stated rate when there are no fees", () => {
    const { rows, summary } = buildTermLoan(loan());
    expect(rows[0]?.period).toBe(1);
    expect(summary.upfrontFeesCents).toBe(0);
    expect(summary.netProceedsCents).toBe(10_000_000);
    expect(summary.effectiveAprPercent).toBeCloseTo(7.5, 3);
  });

  it("treats a flat fee and the equivalent percentage identically", () => {
    const flat = buildTermLoan(loan({ fees: [{ label: "Origination", amount: { kind: "flat", amountCents: 200_000 } }] }));
    const pct = buildTermLoan(loan({ fees: [{ label: "Origination", amount: { kind: "percent", percent: 2 } }] }));
    expect(pct).toEqual(flat);
  });

  it("annualizes weekly payments with 52 periods per year", () => {
    const { summary } = buildTermLoan(loan({ frequency: "weekly", periods: 520 }));
    expect(summary.effectiveAprPercent).toBeCloseTo(7.5, 2);
  });
});
