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

describe("extra payments (REQ-FUNC-PL03)", () => {
  // "Acceleration of loan payoff via recurring extra payments" in features/personal_loans.feature
  describe("BDD: $20,000 at 6% over 48 months plus $100 per month", () => {
    const { rows, summary } = buildSchedule(
      loan({ principalCents: 2_000_000, aprPercent: 6, periods: 48, extraPayments: { recurringCents: 10_000 } }),
    );

    it("reduces the term by at least 7 months", () => {
      expect(summary.extraPaymentImpact?.periodsSaved).toBe(9);
      expect(summary.extraPaymentImpact?.periodsSaved).toBeGreaterThanOrEqual(7);
      expect(rows).toHaveLength(39);
    });

    it("saves more than $400 of interest", () => {
      expect(summary.extraPaymentImpact?.interestSavedCents).toBe(49_821);
      expect(summary.extraPaymentImpact?.interestSavedCents).toBeGreaterThan(40_000);
    });

    it("adds the extra to every payment before the payoff", () => {
      for (const row of rows.slice(0, -1)) {
        expect(row.paymentCents).toBe(summary.regularPaymentCents + 10_000);
      }
    });

    it("still repays exactly the principal", () => {
      expect(sum(rows.map((r) => r.principalCents))).toBe(2_000_000);
      expect(rows.at(-1)?.balanceCents).toBe(0);
    });
  });

  it("applies a one-time extra payment in its period only", () => {
    const { rows, summary } = buildSchedule(
      loan({ extraPayments: { oneTime: [{ period: 6, amountCents: 200_000 }] } }),
    );
    expect(rows[4]?.paymentCents).toBe(43_871);
    expect(rows[5]?.paymentCents).toBe(43_871 + 200_000);
    expect(rows[6]?.paymentCents).toBe(43_871);
    expect(rows).toHaveLength(20);
    expect(summary.totalInterestCents).toBe(39_112);
    expect(summary.extraPaymentImpact).toEqual({ periodsSaved: 4, interestSavedCents: 52_915 - 39_112 });
  });

  it("combines one-time extras that fall in the same period", () => {
    const split = buildSchedule(
      loan({
        extraPayments: {
          oneTime: [
            { period: 6, amountCents: 50_000 },
            { period: 6, amountCents: 150_000 },
          ],
        },
      }),
    );
    const single = buildSchedule(loan({ extraPayments: { oneTime: [{ period: 6, amountCents: 200_000 }] } }));
    expect(split.rows).toEqual(single.rows);
  });

  it("caps the payment at the payoff amount instead of overpaying", () => {
    const { rows, summary } = buildSchedule(
      loan({ extraPayments: { oneTime: [{ period: 1, amountCents: 2_000_000 }] } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ paymentCents: 1_004_167, principalCents: 1_000_000, balanceCents: 0 });
    expect(summary.extraPaymentImpact?.periodsSaved).toBe(23);
  });

  it("produces the baseline schedule when extras are zero, with no impact reported", () => {
    const baseline = buildSchedule(loan());
    const zero = buildSchedule(loan({ extraPayments: { recurringCents: 0, oneTime: [] } }));
    expect(zero.rows).toEqual(baseline.rows);
    expect(baseline.summary.extraPaymentImpact).toBeUndefined();
    expect(zero.summary.extraPaymentImpact).toEqual({ periodsSaved: 0, interestSavedCents: 0 });
  });

  it.each([
    ["a negative recurring extra", { recurringCents: -1 }],
    ["fractional recurring cents", { recurringCents: 0.5 }],
    ["a one-time extra in period 0", { oneTime: [{ period: 0, amountCents: 100 }] }],
    ["a one-time extra after the term", { oneTime: [{ period: 25, amountCents: 100 }] }],
    ["a non-positive one-time amount", { oneTime: [{ period: 3, amountCents: 0 }] }],
  ])("rejects %s", (_label, extraPayments) => {
    expect(() => buildSchedule(loan({ extraPayments }))).toThrow(RangeError);
  });
});
