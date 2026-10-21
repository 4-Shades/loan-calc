import { describe, expect, it } from "vitest";
import { buildRevolvingSchedule, type RevolvingInput } from "@/engine/revolving";

const line = (overrides: Partial<RevolvingInput> = {}): RevolvingInput => ({
  balanceCents: 800_000,
  aprPercent: 18,
  minimumPaymentPercent: 2.5,
  startDate: "2026-01-15",
  ...overrides,
});

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("buildRevolvingSchedule (REQ-FUNC-PL01 #3, decision D11)", () => {
  // "Revolving line of credit minimum payment calculation" in features/personal_loans.feature
  describe("BDD: $8,000 at 18% APR with a 2.5% minimum", () => {
    const { rows, summary, paidOff } = buildRevolvingSchedule(line());

    it("starts with a $200.00 minimum: $120.00 interest, $80.00 principal", () => {
      expect(rows[0]).toMatchObject({
        period: 1,
        date: "2026-02-15",
        paymentCents: 20_000,
        interestCents: 12_000,
        principalCents: 8_000,
        balanceCents: 792_000,
      });
      expect(summary.regularPaymentCents).toBe(20_000);
    });

    it("recomputes the minimum on the current balance each period, with no floor", () => {
      // 2.5% of $7,920.00 = $198.00; interest 1.5% = $118.80
      expect(rows[1]).toMatchObject({ paymentCents: 19_800, interestCents: 11_880, principalCents: 7_920 });
    });

    it("takes 943 months of minimum payments to clear the balance", () => {
      expect(paidOff).toBe(true);
      expect(rows).toHaveLength(943);
      expect(summary.totalInterestCents).toBe(1_199_908);
      expect(rows.at(-1)?.balanceCents).toBe(0);
      expect(sum(rows.map((r) => r.principalCents))).toBe(800_000);
    });

    it("never lets a payment fall below one cent of principal", () => {
      for (const row of rows) {
        expect(row.principalCents).toBeGreaterThanOrEqual(1);
        expect(row.principalCents + row.interestCents).toBe(row.paymentCents);
      }
    });
  });

  it("stops at the period cap and reports the remaining balance", () => {
    const { rows, summary, paidOff } = buildRevolvingSchedule(line({ maxPeriods: 12 }));
    expect(paidOff).toBe(false);
    expect(rows).toHaveLength(12);
    expect(rows.at(-1)?.balanceCents).toBeGreaterThan(0);
    expect(summary.periods).toBe(12);
  });

  it("caps at 1,200 periods (100 years) by default", () => {
    // 1.6% minimum vs 1.5% monthly interest: about 0.1% principal per month.
    const { rows, paidOff } = buildRevolvingSchedule(line({ minimumPaymentPercent: 1.6 }));
    expect(paidOff).toBe(false);
    expect(rows).toHaveLength(1_200);
  });

  it("pays off in one period when the minimum covers the whole balance", () => {
    const { rows, paidOff } = buildRevolvingSchedule(line({ aprPercent: 0, minimumPaymentPercent: 100 }));
    expect(paidOff).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ paymentCents: 800_000, principalCents: 800_000, balanceCents: 0 });
  });

  it("applies the percentage to the balance before interest, as in the BDD", () => {
    // 100% of $8,000 pays the balance but not the $120 of interest charged this month.
    const { rows } = buildRevolvingSchedule(line({ minimumPaymentPercent: 100 }));
    expect(rows[0]).toMatchObject({ paymentCents: 800_000, interestCents: 12_000, balanceCents: 12_000 });
  });

  it("rejects a minimum that does not cover the first month's interest", () => {
    // 1% of $8,000 = $80 < $120 interest: the balance would grow forever.
    expect(() => buildRevolvingSchedule(line({ minimumPaymentPercent: 1 }))).toThrow(/does not cover interest/);
    expect(() => buildRevolvingSchedule(line({ minimumPaymentPercent: 1.5 }))).toThrow(/does not cover interest/);
  });

  it.each([
    ["zero balance", { balanceCents: 0 }],
    ["fractional cents", { balanceCents: 10.5 }],
    ["negative APR", { aprPercent: -1 }],
    ["zero minimum", { minimumPaymentPercent: 0 }],
    ["minimum over 100%", { minimumPaymentPercent: 100.01 }],
    ["zero period cap", { maxPeriods: 0 }],
    ["invalid start date", { startDate: "2026-02-30" }],
  ])("rejects %s", (_label, override) => {
    expect(() => buildRevolvingSchedule(line(override))).toThrow(RangeError);
  });
});
