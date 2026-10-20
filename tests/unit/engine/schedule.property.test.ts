import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildSchedule, type FixedScheduleInput } from "@/engine/schedule";
import { periodsForTerm, type PaymentFrequency } from "@/engine/payment";

// Input domain from REQ-FUNC-PL02: principal $100–$500,000, APR 0.01%–100%,
// with terms of up to 30 years at any payment frequency.
const frequencies: PaymentFrequency[] = ["weekly", "biweekly", "monthly", "annually"];

const loanArb: fc.Arbitrary<FixedScheduleInput> = fc
  .constantFrom(...frequencies)
  .chain((frequency) =>
    fc.record({
      principalCents: fc.integer({ min: 10_000, max: 50_000_000 }),
      aprPercent: fc.integer({ min: 1, max: 10_000 }).map((bp) => bp / 100),
      // An annual schedule needs at least 6 months to round to one payment.
      periods: fc
        .integer({ min: frequency === "annually" ? 6 : 1, max: 360 })
        .map((termMonths) => periodsForTerm(termMonths, frequency)),
      frequency: fc.constant(frequency),
      startDate: fc.constant("2026-01-31"),
    }),
  );

/** Builds the schedule, or returns null when the engine rejects the loan as non-amortizing. */
function tryBuild(input: FixedScheduleInput) {
  try {
    return buildSchedule(input);
  } catch (error) {
    expect(error).toBeInstanceOf(RangeError);
    expect((error as RangeError).message).toMatch(/does not amortize/);
    return null;
  }
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("buildSchedule properties (REQ-FUNC-AN01)", () => {
  it("repays exactly the principal and ends at a zero balance", () => {
    fc.assert(
      fc.property(loanArb, (input) => {
        const schedule = tryBuild(input);
        if (!schedule) return;
        expect(sum(schedule.rows.map((r) => r.principalCents))).toBe(input.principalCents);
        expect(schedule.rows.at(-1)?.balanceCents).toBe(0);
      }),
      { numRuns: 1000 },
    );
  });

  it("never produces negative amounts or a rising balance", () => {
    fc.assert(
      fc.property(loanArb, (input) => {
        const schedule = tryBuild(input);
        if (!schedule) return;
        let previous = input.principalCents;
        for (const row of schedule.rows) {
          expect(row.principalCents).toBeGreaterThan(0);
          expect(row.interestCents).toBeGreaterThanOrEqual(0);
          expect(row.balanceCents).toBeGreaterThanOrEqual(0);
          expect(row.balanceCents).toBeLessThan(previous);
          previous = row.balanceCents;
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("reports total interest as total paid minus principal", () => {
    fc.assert(
      fc.property(loanArb, (input) => {
        const schedule = tryBuild(input);
        if (!schedule) return;
        const { rows, summary } = schedule;
        expect(summary.totalPaidCents).toBe(sum(rows.map((r) => r.paymentCents)));
        expect(summary.totalInterestCents).toBe(summary.totalPaidCents - input.principalCents);
        expect(summary.periods).toBe(rows.length);
      }),
      { numRuns: 1000 },
    );
  });

  it("never needs more periods than the term", () => {
    fc.assert(
      fc.property(loanArb, (input) => {
        const schedule = tryBuild(input);
        if (!schedule) return;
        expect(schedule.rows.length).toBeLessThanOrEqual(input.periods);
      }),
      { numRuns: 1000 },
    );
  });

  // Total interest is NOT strictly monotonic in APR once payments are rounded to the
  // cent (see the counterexample below), but the regular payment always is.
  it("never lowers the regular payment at a higher APR", () => {
    fc.assert(
      fc.property(loanArb, fc.integer({ min: 1, max: 2_000 }), (input, extraBasisPoints) => {
        const higher = { ...input, aprPercent: input.aprPercent + extraBasisPoints / 100 };
        const low = tryBuild(input);
        const high = tryBuild(higher);
        if (!low || !high) return;
        expect(high.summary.regularPaymentCents).toBeGreaterThanOrEqual(low.summary.regularPaymentCents);
      }),
      { numRuns: 500 },
    );
  });

  it("can charge less interest at a higher APR when payment rounding flips direction", () => {
    // Found by fast-check. At 52.34% the exact payment $2.0944 rounds down to $2.09
    // (small underpayment, larger final payment); at 53.34% $2.1292 rounds up to
    // $2.13 (small overpayment, early payoff). Correct accounting, not a bug.
    const base = { principalCents: 10_000, periods: 163, frequency: "biweekly" as const, startDate: "2026-01-31" };
    const low = buildSchedule({ ...base, aprPercent: 52.34 });
    const high = buildSchedule({ ...base, aprPercent: 53.34 });
    expect(low.summary.regularPaymentCents).toBe(209);
    expect(high.summary.regularPaymentCents).toBe(213);
    expect(high.summary.totalInterestCents).toBeLessThan(low.summary.totalInterestCents);
  });
});
