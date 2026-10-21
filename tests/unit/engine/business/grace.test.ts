import { describe, expect, it } from "vitest";
import { buildGracePeriodLoan, type GracePeriodLoanInput } from "@/engine/business/graceInterestOnly";
import { buildSchedule } from "@/engine/schedule";

const loan = (overrides: Partial<GracePeriodLoanInput> = {}): GracePeriodLoanInput => ({
  principalCents: 10_000_000,
  aprPercent: 7.5,
  periods: 36,
  gracePeriods: 6,
  frequency: "monthly",
  startDate: "2026-01-31",
  ...overrides,
});

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("buildGracePeriodLoan (REQ-FUNC-BL01 #4, BL02)", () => {
  // "Term loan with interest-only grace period" in features/business_loans.feature
  describe("BDD: $100,000 at 7.5% over 36 months with a 6-month grace period", () => {
    const { rows, summary } = buildGracePeriodLoan(loan());

    it("has no principal reduction in periods 1 through 6", () => {
      for (const row of rows.slice(0, 6)) {
        expect(row.principalCents).toBe(0);
        expect(row.balanceCents).toBe(10_000_000);
      }
    });

    it("requires $625.00 interest-only payments in periods 1 through 6", () => {
      for (const row of rows.slice(0, 6)) {
        expect(row).toMatchObject({ paymentCents: 62_500, interestCents: 62_500 });
      }
    });

    it("amortizes the full $100,000 over the remaining 30 months from period 7", () => {
      const amortizing = rows.slice(6);
      expect(amortizing).toHaveLength(30);
      expect(amortizing[0]).toMatchObject({ period: 7, paymentCents: 366_597 });
      expect(sum(amortizing.map((r) => r.principalCents))).toBe(10_000_000);
      expect(rows.at(-1)).toMatchObject({ period: 36, paymentCents: 366_592, balanceCents: 0 });
    });

    it("reports totals and an effective APR equal to the stated rate", () => {
      expect(summary.regularPaymentCents).toBe(366_597);
      expect(summary.totalInterestCents).toBe(1_372_905);
      expect(summary.periods).toBe(36);
      expect(summary.effectiveAprPercent).toBeCloseTo(7.5, 3);
    });
  });

  it("keeps the origination day across the grace period (Jan 31 → Jul 31, not Jul 28)", () => {
    const { rows } = buildGracePeriodLoan(loan());
    expect(rows[0]?.date).toBe("2026-02-28");
    expect(rows[5]?.date).toBe("2026-07-31");
    expect(rows[6]?.date).toBe("2026-08-31");
  });

  it("is identical to a fully amortizing loan with no grace period", () => {
    const grace = buildGracePeriodLoan(loan({ gracePeriods: 0 }));
    const plain = buildSchedule({ principalCents: 10_000_000, aprPercent: 7.5, periods: 36, frequency: "monthly", startDate: "2026-01-31" });
    expect(grace.rows).toEqual(plain.rows);
  });

  it("raises the effective APR when fees are withheld", () => {
    const { rows, summary } = buildGracePeriodLoan(
      loan({ fees: [{ label: "Origination", amount: { kind: "percent", percent: 1 } }] }),
    );
    expect(rows[0]?.period).toBe(0);
    expect(summary.effectiveAprPercent).toBeGreaterThan(7.5);
  });

  it.each([-1, 1.5, 36, 40])("rejects a grace period of %d periods on a 36-period loan", (gracePeriods) => {
    expect(() => buildGracePeriodLoan(loan({ gracePeriods }))).toThrow(RangeError);
  });
});
