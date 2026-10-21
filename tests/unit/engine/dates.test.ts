import { describe, expect, it } from "vitest";
import { addBusinessDays, paymentDate } from "@/engine/dates";

describe("addBusinessDays (MCA daily withdrawals)", () => {
  // 2026-01-15 is a Thursday. Weekends are skipped; public holidays are not modeled.
  it.each([
    ["2026-01-15", 0, "2026-01-15"],
    ["2026-01-15", 1, "2026-01-16"],
    ["2026-01-15", 2, "2026-01-19"],
    ["2026-01-15", 5, "2026-01-22"],
    ["2026-01-16", 1, "2026-01-19"],
    ["2026-01-17", 1, "2026-01-19"],
    ["2026-01-17", 5, "2026-01-23"],
    ["2026-01-18", 1, "2026-01-19"],
    ["2026-01-15", 126, "2026-07-10"],
  ])("%s + %i business days → %s", (start, days, expected) => {
    expect(addBusinessDays(start, days)).toBe(expected);
  });

  it("rejects negative or fractional day counts and invalid dates", () => {
    expect(() => addBusinessDays("2026-01-15", -1)).toThrow(RangeError);
    expect(() => addBusinessDays("2026-01-15", 1.5)).toThrow(RangeError);
    expect(() => addBusinessDays("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("paymentDate", () => {
  it("advances weekly and bi-weekly by 7 and 14 days", () => {
    expect(paymentDate("2026-01-01", "weekly", 1)).toBe("2026-01-08");
    expect(paymentDate("2026-01-01", "weekly", 5)).toBe("2026-02-05");
    expect(paymentDate("2026-01-01", "biweekly", 1)).toBe("2026-01-15");
  });

  it("keeps the anchor day for monthly payments, clamping to month end", () => {
    expect(paymentDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(paymentDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(paymentDate("2026-01-31", "monthly", 3)).toBe("2026-04-30");
    expect(paymentDate("2027-12-31", "monthly", 2)).toBe("2028-02-29");
  });

  it("rolls over years for monthly payments", () => {
    expect(paymentDate("2026-11-15", "monthly", 3)).toBe("2027-02-15");
  });

  it("clamps Feb 29 to Feb 28 in non-leap years for annual payments", () => {
    expect(paymentDate("2024-02-29", "annually", 1)).toBe("2025-02-28");
    expect(paymentDate("2024-02-29", "annually", 4)).toBe("2028-02-29");
  });

  it.each(["2026-13-01", "2026-02-30", "26-01-01", "not a date"])("rejects invalid start date %s", (start) => {
    expect(() => paymentDate(start, "monthly", 1)).toThrow(RangeError);
  });
});
