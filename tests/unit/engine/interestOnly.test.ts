import { describe, expect, it } from "vitest";
import { buildInterestOnlySchedule } from "@/engine/interestOnly";
import type { ScheduleInput } from "@/engine/schedule";

const loan = (overrides: Partial<ScheduleInput> = {}): ScheduleInput => ({
  principalCents: 1_000_000,
  aprPercent: 6,
  periods: 12,
  frequency: "monthly",
  startDate: "2026-01-15",
  ...overrides,
});

describe("buildInterestOnlySchedule (REQ-FUNC-PL01 #2: interest-only with balloon)", () => {
  const { rows, summary } = buildInterestOnlySchedule(loan());

  it("charges interest only until the final period", () => {
    // $10,000 × 6% / 12 = $50.00
    for (const row of rows.slice(0, -1)) {
      expect(row).toMatchObject({ paymentCents: 5_000, interestCents: 5_000, principalCents: 0 });
      expect(row.balanceCents).toBe(1_000_000);
    }
  });

  it("repays the full principal as a balloon in the final period", () => {
    expect(rows).toHaveLength(12);
    expect(rows.at(-1)).toMatchObject({
      period: 12,
      date: "2027-01-15",
      paymentCents: 1_005_000,
      principalCents: 1_000_000,
      interestCents: 5_000,
      balanceCents: 0,
    });
  });

  it("summarizes the interest-only payment and totals", () => {
    expect(summary).toEqual({
      regularPaymentCents: 5_000,
      totalPaidCents: 1_060_000,
      totalInterestCents: 60_000,
      totalFeesCents: 0,
      periods: 12,
    });
  });

  it("is a single balloon payment for a one-period loan", () => {
    const single = buildInterestOnlySchedule(loan({ periods: 1, frequency: "annually" }));
    expect(single.rows).toEqual([
      {
        period: 1,
        date: "2027-01-15",
        paymentCents: 1_060_000,
        principalCents: 1_000_000,
        interestCents: 60_000,
        feesCents: 0,
        balanceCents: 0,
      },
    ]);
  });

  it("charges no interest at 0% APR", () => {
    const zero = buildInterestOnlySchedule(loan({ aprPercent: 0 }));
    expect(zero.summary.totalInterestCents).toBe(0);
    expect(zero.rows.at(-1)?.paymentCents).toBe(1_000_000);
  });

  it("rejects invalid input", () => {
    expect(() => buildInterestOnlySchedule(loan({ periods: 0 }))).toThrow(RangeError);
    expect(() => buildInterestOnlySchedule(loan({ startDate: "2026-02-30" }))).toThrow(RangeError);
  });
});
