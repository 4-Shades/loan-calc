import { describe, expect, it } from "vitest";
import { paymentDate } from "@/engine/dates";

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
