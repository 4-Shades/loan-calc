import { describe, expect, it } from "vitest";
import { saveCalculationRequestSchema } from "@/schemas/saveCalculation";

const input = {
  loanType: "TERM_SBA",
  principal: 100_000,
  aprPercent: 7.5,
  term: { value: 10, unit: "years" },
  frequency: "monthly",
  startDate: "2026-01-15",
};

const issues = (body: unknown) => {
  const result = saveCalculationRequestSchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("saveCalculationRequestSchema (REQ-FUNC-DB01, REQ-NFR-CODE2)", () => {
  it("accepts a title and a valid loan input", () => {
    expect(issues({ title: "Option A - Local Bank SBA", input })).toEqual([]);
  });

  it("sanitizes the title (REQ-NFR-SEC1)", () => {
    expect(saveCalculationRequestSchema.parse({ title: "  <b>Option A</b> ", input }).title).toBe("Option A");
  });

  it.each([
    ["", "title: Enter a title"],
    ["<i></i>", "title: Enter a title"],
    ["x".repeat(151), "title: Use at most 150 characters"],
  ])("rejects the title %j", (title, message) => {
    expect(issues({ title, input })).toEqual([message]);
  });

  it("reports loan input problems under input.*", () => {
    expect(issues({ title: "A", input: { ...input, principal: 50 } })).toEqual([
      "input.principal: Loan amount must be between $100 and $10,000,000",
    ]);
  });

  it("does not accept client-supplied results; the server computes them", () => {
    expect(issues({ title: "A", input, summary: { totalInterestCents: 0 } })).toEqual([
      ': Unrecognized key: "summary"',
    ]);
  });
});
