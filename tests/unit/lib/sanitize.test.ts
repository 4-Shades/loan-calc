import { describe, expect, it } from "vitest";
import { sanitizeTitle } from "@/lib/sanitize";

describe("sanitizeTitle (REQ-NFR-SEC1)", () => {
  it.each([
    ["  Option A - Local Bank SBA  ", "Option A - Local Bank SBA"],
    ["<script>alert(1)</script>Offer", "alert(1)Offer"],
    ['<img src=x onerror="alert(1)">Bank', "Bank"],
    ["Rate < 5% > zero", "Rate 5% zero"],
    ["Line\nbreak\ttab\u0000null", "Line break tab null"],
    ["many    spaces", "many spaces"],
    ["Café", "Café"],
  ])("%j → %j", (raw, expected) => {
    expect(sanitizeTitle(raw)).toBe(expected);
  });

  it("leaves SQL-looking text alone: queries are parameterized, so it is stored literally", () => {
    expect(sanitizeTitle("'; DROP TABLE saved_calculations;--")).toBe("'; DROP TABLE saved_calculations;--");
  });

  it("can reduce a title to nothing", () => {
    expect(sanitizeTitle("<b></b>  ")).toBe("");
  });
});
