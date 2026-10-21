import { describe, expect, it } from "vitest";
import {
  fixedPaymentCents,
  periodicRate,
  periodsForTerm,
  type PaymentFrequency,
} from "@/engine/payment";

describe("fixedPaymentCents (REQ-FUNC-PL01, PL02)", () => {
  // Examples table of "Compute standard fixed-rate personal installment loan"
  // in features/personal_loans.feature.
  it.each([
    [1_000_000, 5.0, 24, 43871],
    [2_500_000, 8.5, 60, 51291],
    [500_000, 12.0, 12, 44424],
  ])("principal %i¢ at %d%% over %i months → %i¢", (principalCents, aprPercent, periods, expected) => {
    expect(fixedPaymentCents({ principalCents, aprPercent, periods, frequency: "monthly" })).toBe(expected);
  });

  it("matches the textbook $200,000 / 6% / 30-year mortgage payment of $1,199.10", () => {
    expect(
      fixedPaymentCents({ principalCents: 20_000_000, aprPercent: 6, periods: 360, frequency: "monthly" }),
    ).toBe(119910);
  });

  it("charges one full year of interest for a single annual period", () => {
    expect(
      fixedPaymentCents({ principalCents: 1_000_000, aprPercent: 5, periods: 1, frequency: "annually" }),
    ).toBe(1_050_000);
  });

  it.each<[PaymentFrequency, number, number]>([
    ["weekly", 104, 10109],
    ["biweekly", 52, 20227],
  ])("supports %s payments", (frequency, periods, expected) => {
    expect(fixedPaymentCents({ principalCents: 1_000_000, aprPercent: 5, periods, frequency })).toBe(expected);
  });

  it("handles the 0.01% APR lower bound", () => {
    expect(
      fixedPaymentCents({ principalCents: 1_000_000, aprPercent: 0.01, periods: 24, frequency: "monthly" }),
    ).toBe(41671);
  });

  it("handles the 100% APR upper bound", () => {
    expect(
      fixedPaymentCents({ principalCents: 1_000_000, aprPercent: 100, periods: 12, frequency: "monthly" }),
    ).toBe(134996);
  });

  it("leaves a balloon balance to be repaid with the final payment (decision D9)", () => {
    // $120,000 at 6.5% over 48 months, $15,000 remaining at the end.
    expect(
      fixedPaymentCents({
        principalCents: 12_000_000,
        aprPercent: 6.5,
        periods: 48,
        frequency: "monthly",
        balloonCents: 1_500_000,
      }),
    ).toBe(257_132);
    expect(
      fixedPaymentCents({
        principalCents: 12_000_000,
        aprPercent: 0,
        periods: 48,
        frequency: "monthly",
        balloonCents: 1_500_000,
      }),
    ).toBe(218_750);
  });

  it.each([-1, 0.5, 12_000_000])("rejects a balloon of %d cents", (balloonCents) => {
    expect(() =>
      fixedPaymentCents({ principalCents: 12_000_000, aprPercent: 6.5, periods: 48, frequency: "monthly", balloonCents }),
    ).toThrow(RangeError);
  });

  it("divides principal evenly when the rate is exactly zero", () => {
    expect(
      fixedPaymentCents({ principalCents: 1_000_000, aprPercent: 0, periods: 24, frequency: "monthly" }),
    ).toBe(41667);
  });

  it.each([
    ["zero principal", { principalCents: 0 }],
    ["fractional cents", { principalCents: 100.5 }],
    ["negative APR", { aprPercent: -1 }],
    ["zero periods", { periods: 0 }],
    ["fractional periods", { periods: 1.5 }],
  ])("rejects %s", (_label, override) => {
    const input = { principalCents: 1_000_000, aprPercent: 5, periods: 24, frequency: "monthly" as const, ...override };
    expect(() => fixedPaymentCents(input)).toThrow(RangeError);
  });
});

describe("periodicRate", () => {
  it.each<[PaymentFrequency, number]>([
    ["weekly", 0.052 / 52],
    ["biweekly", 0.052 / 26],
    ["monthly", 0.052 / 12],
    ["annually", 0.052],
  ])("divides APR by periods per year for %s", (frequency, expected) => {
    expect(periodicRate(5.2, frequency)).toBeCloseTo(expected, 15);
  });
});

describe("periodsForTerm", () => {
  it.each<[number, PaymentFrequency, number]>([
    [24, "monthly", 24],
    [24, "weekly", 104],
    [24, "biweekly", 52],
    [24, "annually", 2],
    [1, "weekly", 4],
  ])("%i months paid %s → %i periods", (termMonths, frequency, expected) => {
    expect(periodsForTerm(termMonths, frequency)).toBe(expected);
  });

  it("rejects terms shorter than one payment period", () => {
    expect(() => periodsForTerm(1, "annually")).toThrow(RangeError);
  });

  it("rejects non-positive or fractional month terms", () => {
    expect(() => periodsForTerm(0, "monthly")).toThrow(RangeError);
    expect(() => periodsForTerm(2.5, "monthly")).toThrow(RangeError);
  });
});
