import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { periodicIrr } from "@/engine/irr";
import { buildTermLoan } from "@/engine/business/term";
import { buildGracePeriodLoan } from "@/engine/business/graceInterestOnly";
import { periodsForTerm, type PaymentFrequency } from "@/engine/payment";

const frequencies: PaymentFrequency[] = ["weekly", "biweekly", "monthly", "annually"];

// Realistic business loans: $10,000–$5,000,000 at 1%–30% APR over up to 30 years.
const businessLoanArb = fc.constantFrom(...frequencies).chain((frequency) =>
  fc.record({
    principalCents: fc.integer({ min: 1_000_000, max: 500_000_000 }),
    aprPercent: fc.integer({ min: 100, max: 3_000 }).map((bp) => bp / 100),
    periods: fc
      .integer({ min: frequency === "annually" ? 6 : 1, max: 360 })
      .map((termMonths) => periodsForTerm(termMonths, frequency)),
    frequency: fc.constant(frequency),
    startDate: fc.constant("2026-01-31"),
  }),
);

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Runs `build`, or returns null when the engine rejects the loan as non-amortizing (e.g. 30% over 30 years). */
function tryBuild<T>(build: () => T): T | null {
  try {
    return build();
  } catch (error) {
    expect(error).toBeInstanceOf(RangeError);
    expect((error as RangeError).message).toMatch(/does not amortize/);
    return null;
  }
}

describe("periodicIrr properties", () => {
  it("recovers the rate used to price an exact level-payment loan", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0001, max: 0.5, noNaN: true }),
        fc.integer({ min: 1, max: 360 }),
        (rate, n) => {
          const payment = (1_000_000 * rate) / (1 - Math.pow(1 + rate, -n));
          expect(periodicIrr([-1_000_000, ...Array<number>(n).fill(payment)])).toBeCloseTo(rate, 9);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("business loan properties (REQ-FUNC-BL03)", () => {
  it("has an effective APR within 0.01 points of the stated rate when there are no fees", () => {
    fc.assert(
      fc.property(businessLoanArb, (input) => {
        const loan = tryBuild(() => buildTermLoan(input));
        if (!loan) return;
        expect(Math.abs(loan.summary.effectiveAprPercent - input.aprPercent)).toBeLessThan(0.01);
      }),
      { numRuns: 500 },
    );
  });

  it("has an effective APR above the stated rate when at least 0.5% in fees is withheld", () => {
    fc.assert(
      fc.property(businessLoanArb, fc.integer({ min: 50, max: 1_000 }), (input, feeBasisPoints) => {
        const loan = tryBuild(() =>
          buildTermLoan({
            ...input,
            fees: [{ label: "Origination", amount: { kind: "percent", percent: feeBasisPoints / 100 } }],
          }),
        );
        if (!loan) return;
        expect(loan.summary.effectiveAprPercent).toBeGreaterThan(input.aprPercent);
        expect(loan.summary.netProceedsCents).toBe(input.principalCents - loan.summary.upfrontFeesCents);
      }),
      { numRuns: 500 },
    );
  });

  it("grace period loans pay interest only, then repay exactly the principal", () => {
    const graceArb = businessLoanArb
      .filter((input) => input.periods >= 2)
      .chain((input) => fc.record({ input: fc.constant(input), gracePeriods: fc.integer({ min: 0, max: input.periods - 1 }) }));

    fc.assert(
      fc.property(graceArb, ({ input, gracePeriods }) => {
        const loan = tryBuild(() => buildGracePeriodLoan({ ...input, gracePeriods }));
        if (!loan) return;
        const { rows } = loan;
        expect(rows.slice(0, gracePeriods).every((r) => r.principalCents === 0)).toBe(true);
        expect(sum(rows.map((r) => r.principalCents))).toBe(input.principalCents);
        expect(rows.at(-1)?.balanceCents).toBe(0);
        expect(rows.length).toBeLessThanOrEqual(input.periods);
        rows.forEach((row, i) => expect(row.period).toBe(i + 1));
      }),
      { numRuns: 500 },
    );
  });
});
