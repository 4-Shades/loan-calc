import { describe, expect, it } from "vitest";
import { resolveAmountCents, totalUpfrontFeesCents } from "@/engine/business/fees";

describe("resolveAmountCents (flat or % of total, REQ-FUNC-BL02)", () => {
  it("returns flat amounts as-is", () => {
    expect(resolveAmountCents({ kind: "flat", amountCents: 150_000 }, 10_000_000)).toBe(150_000);
  });

  it("takes a percentage of the base amount, rounded to the cent", () => {
    expect(resolveAmountCents({ kind: "percent", percent: 2 }, 10_000_000)).toBe(200_000);
    expect(resolveAmountCents({ kind: "percent", percent: 3.75 }, 33_333)).toBe(1_250);
  });

  it.each([
    ["negative flat amount", { kind: "flat", amountCents: -1 } as const],
    ["fractional cents", { kind: "flat", amountCents: 1.5 } as const],
    ["negative percent", { kind: "percent", percent: -1 } as const],
    ["percent above 100", { kind: "percent", percent: 100.01 } as const],
  ])("rejects a %s", (_label, amount) => {
    expect(() => resolveAmountCents(amount, 10_000_000)).toThrow(RangeError);
  });
});

describe("totalUpfrontFeesCents (decision D12)", () => {
  it("sums origination and guarantee fees", () => {
    expect(
      totalUpfrontFeesCents(
        [
          { label: "Origination", amount: { kind: "percent", percent: 2 } },
          { label: "SBA guarantee", amount: { kind: "flat", amountCents: 150_000 } },
        ],
        10_000_000,
      ),
    ).toBe(350_000);
  });

  it("is zero with no fees", () => {
    expect(totalUpfrontFeesCents(undefined, 10_000_000)).toBe(0);
    expect(totalUpfrontFeesCents([], 10_000_000)).toBe(0);
  });

  it("rejects fees that consume the whole loan", () => {
    expect(() =>
      totalUpfrontFeesCents([{ label: "Everything", amount: { kind: "percent", percent: 100 } }], 10_000_000),
    ).toThrow(RangeError);
  });
});
