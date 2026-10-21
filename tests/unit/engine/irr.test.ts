import { describe, expect, it } from "vitest";
import { effectiveAprPercent, periodicIrr } from "@/engine/irr";

describe("periodicIrr", () => {
  it.each([
    [[-1000, 1100], 0.1],
    [[-100, 60, 60], 0.130662386],
    [[-100, 50, 50], 0],
    [[-100, 40, 40], -0.136675042],
  ])("solves %j → %d", (flows, expected) => {
    expect(periodicIrr(flows)).toBeCloseTo(expected, 9);
  });

  it("recovers the periodic rate of an exact level-payment loan", () => {
    const rate = 0.005;
    const n = 360;
    const payment = (100_000 * rate) / (1 - Math.pow(1 + rate, -n));
    expect(periodicIrr([-100_000, ...Array<number>(n).fill(payment)])).toBeCloseTo(rate, 12);
  });

  it("handles very high short-term rates", () => {
    // Pay back double after one period → 100% per period.
    expect(periodicIrr([-100, 200])).toBeCloseTo(1, 9);
    expect(periodicIrr([-100, 10_000])).toBeCloseTo(99, 6);
  });

  it("gives up on rates beyond 100,000,000% per period", () => {
    expect(() => periodicIrr([-1, 1e13])).toThrow(/did not converge/);
  });

  it.each([
    ["no outflow", [100, 50]],
    ["no inflows", [-100]],
    ["inflows of zero only", [-100, 0, 0]],
    ["a later outflow (non-conventional flows)", [-100, 150, -60]],
    ["non-finite values", [-100, Number.NaN]],
  ])("rejects %s", (_label, flows) => {
    expect(() => periodicIrr(flows)).toThrow(RangeError);
  });
});

describe("effectiveAprPercent (REQ-FUNC-BL03, decision D10)", () => {
  it("annualizes the periodic IRR nominally (periodic rate × periods per year)", () => {
    // 1% per month → 12% APR, not the compounded 12.68%.
    const payment = (1_000_000 * 0.01) / (1 - Math.pow(1.01, -12));
    expect(effectiveAprPercent(1_000_000, Array<number>(12).fill(payment), 12)).toBeCloseTo(12, 9);
  });

  it("rejects non-positive proceeds or periods per year", () => {
    expect(() => effectiveAprPercent(0, [100], 12)).toThrow(RangeError);
    expect(() => effectiveAprPercent(100, [200], 0)).toThrow(RangeError);
  });
});
