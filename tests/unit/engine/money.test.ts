import { describe, expect, it } from "vitest";
import { fromCents, roundHalfUp, toCents } from "@/engine/money";

describe("roundHalfUp", () => {
  it.each([
    [2.4, 2],
    [2.5, 3],
    [2.6, 3],
    [-2.5, -3],
    [-2.4, -2],
  ])("rounds %d to %d (half away from zero)", (input, expected) => {
    expect(roundHalfUp(input)).toBe(expected);
  });

  it("ignores binary floating-point noise at the half boundary", () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE-754
    expect(roundHalfUp(1.005 * 100)).toBe(101);
  });

  it("never returns negative zero", () => {
    expect(Object.is(roundHalfUp(-0.4), 0)).toBe(true);
  });

  it("rejects non-finite values", () => {
    expect(() => roundHalfUp(Number.NaN)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("toCents / fromCents", () => {
  it("converts dollars to integer cents", () => {
    expect(toCents(438.71)).toBe(43871);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
  });

  it("converts cents back to dollars", () => {
    expect(fromCents(43871)).toBe(438.71);
    expect(fromCents(0)).toBe(0);
  });
});
