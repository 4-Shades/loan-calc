import { describe, expect, it } from "vitest";
import { buildSchedule, type FixedScheduleInput } from "@/engine/schedule";

const loan = (overrides: Partial<FixedScheduleInput> = {}): FixedScheduleInput => ({
  principalCents: 1_000_000,
  aprPercent: 5,
  periods: 24,
  frequency: "monthly",
  startDate: "2026-01-15",
  ...overrides,
});

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("buildSchedule: BDD fixed-rate examples (REQ-FUNC-PL01, AN01)", () => {
  // Examples table in features/personal_loans.feature (values corrected per D8).
  it.each([
    // principal¢, apr, n, payment¢, total interest¢, final payment¢
    [1_000_000, 5.0, 24, 43871, 52915, 43882],
    [2_500_000, 8.5, 60, 51291, 577486, 51317],
    [500_000, 12.0, 12, 44424, 33093, 44429],
  ])(
    "P=%i¢ APR=%d%% n=%i",
    (principalCents, aprPercent, periods, payment, totalInterest, finalPayment) => {
      const { rows, summary } = buildSchedule(loan({ principalCents, aprPercent, periods }));

      expect(rows).toHaveLength(periods);
      expect(summary.regularPaymentCents).toBe(payment);
      expect(summary.totalInterestCents).toBe(totalInterest);
      expect(rows.at(-1)?.paymentCents).toBe(finalPayment);
      expect(rows.at(-1)?.balanceCents).toBe(0);
    },
  );
});

describe("buildSchedule: row invariants", () => {
  const { rows, summary } = buildSchedule(loan());

  it("numbers periods from 1 and dates them one period apart", () => {
    expect(rows.map((r) => r.period)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(rows[0]?.date).toBe("2026-02-15");
    expect(rows[1]?.date).toBe("2026-03-15");
    expect(rows.at(-1)?.date).toBe("2028-01-15");
  });

  it("charges first-period interest on the full principal", () => {
    // 10,000.00 × 5% / 12 = 41.666… → 41.67
    expect(rows[0]?.interestCents).toBe(4167);
  });

  it("splits every regular payment exactly into principal + interest", () => {
    for (const row of rows) {
      expect(row.principalCents + row.interestCents + row.feesCents).toBe(row.paymentCents);
    }
    for (const row of rows.slice(0, -1)) {
      expect(row.paymentCents).toBe(summary.regularPaymentCents);
    }
  });

  it("reduces the balance every period down to exactly zero", () => {
    let previous = 1_000_000;
    for (const row of rows) {
      expect(row.balanceCents).toBe(previous - row.principalCents);
      expect(row.balanceCents).toBeLessThan(previous);
      previous = row.balanceCents;
    }
    expect(previous).toBe(0);
  });

  it("repays exactly the original principal", () => {
    expect(sum(rows.map((r) => r.principalCents))).toBe(1_000_000);
  });

  it("reports totals consistent with the rows", () => {
    expect(summary.periods).toBe(24);
    expect(summary.totalPaidCents).toBe(sum(rows.map((r) => r.paymentCents)));
    expect(summary.totalInterestCents).toBe(sum(rows.map((r) => r.interestCents)));
    expect(summary.totalInterestCents).toBe(summary.totalPaidCents - 1_000_000);
    expect(summary.totalFeesCents).toBe(0);
  });

  it("has no fees on a plain fixed-rate loan", () => {
    expect(rows.every((r) => r.feesCents === 0)).toBe(true);
  });
});

describe("buildSchedule: edge cases", () => {
  it("charges no interest at 0% APR", () => {
    const { rows, summary } = buildSchedule(loan({ aprPercent: 0 }));
    expect(rows.every((r) => r.interestCents === 0)).toBe(true);
    expect(summary.totalInterestCents).toBe(0);
    expect(rows.at(-1)?.balanceCents).toBe(0);
  });

  it("supports weekly schedules", () => {
    const { rows } = buildSchedule(loan({ frequency: "weekly", periods: 104, startDate: "2026-01-01" }));
    expect(rows).toHaveLength(104);
    expect(rows[0]?.date).toBe("2026-01-08");
    expect(rows.at(-1)?.balanceCents).toBe(0);
  });

  it("pays off early, never overpaying, when rounding the payment up outpaces a tiny loan", () => {
    // $100 over 360 months: payment rounds 27.78¢ → 28¢, overpaying ~0.2¢ every period.
    const { rows } = buildSchedule(loan({ principalCents: 10_000, aprPercent: 0.01, periods: 360 }));
    expect(rows.length).toBeLessThanOrEqual(360);
    expect(rows.at(-1)?.balanceCents).toBe(0);
    expect(rows.every((r) => r.principalCents > 0 && r.balanceCents >= 0)).toBe(true);
  });

  it("rejects loans whose payment cannot amortize principal at cent precision", () => {
    // $100,000 at 100% APR over 30 years: period-1 principal is ~$0.0000000025.
    expect(() => buildSchedule(loan({ principalCents: 10_000_000, aprPercent: 100, periods: 360 }))).toThrow(
      /does not amortize/,
    );
  });

  it("rejects an invalid start date", () => {
    expect(() => buildSchedule(loan({ startDate: "2026-02-30" }))).toThrow(RangeError);
  });
});
