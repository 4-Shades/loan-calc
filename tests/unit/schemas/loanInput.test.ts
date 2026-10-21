import { describe, expect, it } from "vitest";
import {
  LOAN_CATEGORIES,
  LOAN_TYPES,
  categoryOf,
  loanInputSchema,
  type LoanInput,
} from "@/schemas/loanInput";

const fixed = {
  loanType: "FIXED_INSTALLMENT",
  principal: 10_000,
  aprPercent: 5,
  term: { value: 24, unit: "months" },
  frequency: "monthly",
  startDate: "2026-01-15",
} as const;

const valid: Record<LoanInput["loanType"], Record<string, unknown>> = {
  FIXED_INSTALLMENT: fixed,
  INTEREST_ONLY_BALLOON: { ...fixed, loanType: "INTEREST_ONLY_BALLOON" },
  REVOLVING: { loanType: "REVOLVING", balance: 8_000, aprPercent: 18, minimumPaymentPercent: 2.5, startDate: "2026-01-15" },
  TERM_SBA: {
    ...fixed,
    loanType: "TERM_SBA",
    principal: 100_000,
    fees: [{ label: "Origination", amount: { kind: "percent", value: 2 } }],
  },
  EQUIPMENT: {
    loanType: "EQUIPMENT",
    purchasePrice: 150_000,
    downPayment: { kind: "flat", value: 30_000 },
    residualValue: 15_000,
    aprPercent: 6.5,
    term: { value: 48, unit: "months" },
    frequency: "monthly",
    startDate: "2026-01-15",
  },
  MCA: {
    loanType: "MCA",
    advance: 50_000,
    factorRate: 1.25,
    frequency: "daily",
    repayment: { kind: "fixedTerm", termMonths: 6 },
    startDate: "2026-01-15",
  },
  GRACE_PERIOD: { ...fixed, loanType: "GRACE_PERIOD", principal: 100_000, term: { value: 36, unit: "months" }, gracePeriodMonths: 6 },
};

/** Parses and returns the issues as "path: message" strings. */
function issues(input: unknown): string[] {
  const result = loanInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("loanInputSchema (REQ-NFR-CODE2)", () => {
  it.each(LOAN_TYPES)("accepts a valid %s input", (loanType) => {
    expect(issues(valid[loanType])).toEqual([]);
  });

  it("groups loan types into Personal and Business modes (REQ-UI-003)", () => {
    expect(LOAN_CATEGORIES.PERSONAL).toEqual(["FIXED_INSTALLMENT", "INTEREST_ONLY_BALLOON", "REVOLVING"]);
    expect(LOAN_CATEGORIES.BUSINESS).toEqual(["TERM_SBA", "EQUIPMENT", "MCA", "GRACE_PERIOD"]);
    expect(categoryOf("MCA")).toBe("BUSINESS");
    expect(categoryOf("REVOLVING")).toBe("PERSONAL");
  });

  it("rejects an unknown loan type", () => {
    expect(issues({ ...fixed, loanType: "PAYDAY" })[0]).toMatch(/^loanType: /);
  });

  describe("principal (REQ-FUNC-PL02: $100 to $500,000)", () => {
    it.each([100, 500_000, 1234.56])("accepts %d", (principal) => {
      expect(issues({ ...fixed, principal })).toEqual([]);
    });

    it.each([99.99, 500_000.01, -5])("rejects %d", (principal) => {
      expect(issues({ ...fixed, principal })).toEqual(["principal: Loan amount must be between $100 and $500,000"]);
    });

    it("rejects fractions of a cent", () => {
      expect(issues({ ...fixed, principal: 1000.005 })).toEqual(["principal: Enter whole cents"]);
    });

    it.each([Number.NaN, "10000", undefined])("rejects a missing or non-numeric value (%s)", (principal) => {
      expect(issues({ ...fixed, principal })).toEqual(["principal: Loan amount is required"]);
    });

    it("allows business amounts above the personal limit", () => {
      expect(issues({ ...valid.TERM_SBA, principal: 2_000_000 })).toEqual([]);
      expect(issues({ ...valid.TERM_SBA, principal: 10_000_000.01 })).toEqual([
        "principal: Loan amount must be between $100 and $10,000,000",
      ]);
    });
  });

  describe("APR (0.01% to 100%)", () => {
    it.each([0.01, 100])("accepts %d", (aprPercent) => {
      expect(issues({ ...fixed, aprPercent })).toEqual([]);
    });

    it.each([0, 0.009, 100.01])("rejects %d", (aprPercent) => {
      expect(issues({ ...fixed, aprPercent })).toEqual(["aprPercent: APR must be between 0.01% and 100%"]);
    });
  });

  describe("term (months or years, up to 30 years)", () => {
    it("accepts years", () => {
      expect(issues({ ...fixed, term: { value: 30, unit: "years" } })).toEqual([]);
    });

    it.each([
      [{ value: 0, unit: "months" }, "term.value: Term must be at least 1"],
      [{ value: 1.5, unit: "months" }, "term.value: Term must be a whole number"],
      [{ value: 361, unit: "months" }, "term.value: Term can be at most 30 years"],
      [{ value: 31, unit: "years" }, "term.value: Term can be at most 30 years"],
      [{ value: 2, unit: "decades" }, "term.unit: Choose months or years"],
    ])("rejects %j", (term, message) => {
      expect(issues({ ...fixed, term })).toEqual([message]);
    });

    it("rejects a term shorter than one payment period", () => {
      expect(issues({ ...fixed, term: { value: 3, unit: "months" }, frequency: "annually" })).toEqual([
        "term.value: Term is shorter than one annual payment",
      ]);
    });
  });

  describe("payment frequency (Weekly, Bi-Weekly, Monthly, Annually)", () => {
    it.each(["weekly", "biweekly", "monthly", "annually"])("accepts %s", (frequency) => {
      expect(issues({ ...fixed, frequency })).toEqual([]);
    });

    it("rejects daily payments for an installment loan", () => {
      expect(issues({ ...fixed, frequency: "daily" })).toEqual(["frequency: Choose a payment frequency"]);
    });
  });

  describe("start date", () => {
    it.each(["2026-02-30", "2026-13-01", "15/01/2026", ""])("rejects %j", (startDate) => {
      expect(issues({ ...fixed, startDate })).toEqual(["startDate: Enter a valid date"]);
    });
  });

  describe("extra payments (REQ-FUNC-PL02, PL03)", () => {
    it("accepts recurring and one-time extras", () => {
      expect(
        issues({ ...fixed, extraPayments: { recurring: 100, oneTime: [{ period: 6, amount: 2_000 }] } }),
      ).toEqual([]);
    });

    it("rejects a negative recurring extra", () => {
      expect(issues({ ...fixed, extraPayments: { recurring: -1 } })).toEqual([
        "extraPayments.recurring: Extra payment cannot be negative",
      ]);
    });

    it("rejects a one-time extra outside the loan's payments", () => {
      expect(issues({ ...fixed, extraPayments: { oneTime: [{ period: 25, amount: 100 }] } })).toEqual([
        "extraPayments.oneTime.0.period: Choose a payment between 1 and 24",
      ]);
    });

    it("rejects a zero one-time amount", () => {
      expect(issues({ ...fixed, extraPayments: { oneTime: [{ period: 3, amount: 0 }] } })).toEqual([
        "extraPayments.oneTime.0.amount: Extra payment must be more than $0",
      ]);
    });
  });

  describe("revolving line of credit", () => {
    it.each([0, 100.01])("rejects a %d% minimum payment", (minimumPaymentPercent) => {
      expect(issues({ ...valid.REVOLVING, minimumPaymentPercent })).toEqual([
        "minimumPaymentPercent: Minimum payment must be above 0% and at most 100%",
      ]);
    });
  });

  describe("merchant cash advance (factor rate 1.05 to 1.50)", () => {
    it.each([1.05, 1.5])("accepts factor rate %d", (factorRate) => {
      expect(issues({ ...valid.MCA, factorRate })).toEqual([]);
    });

    it.each([1.049, 1.501])("rejects factor rate %d", (factorRate) => {
      expect(issues({ ...valid.MCA, factorRate })).toEqual(["factorRate: Factor rate must be between 1.05 and 1.50"]);
    });

    it("accepts a revenue-share repayment", () => {
      expect(
        issues({ ...valid.MCA, repayment: { kind: "revenueShare", holdbackPercent: 10, revenuePerPeriod: 5_000 } }),
      ).toEqual([]);
    });

    it("rejects an MCA term over 10 years", () => {
      expect(issues({ ...valid.MCA, repayment: { kind: "fixedTerm", termMonths: 121 } })).toEqual([
        "repayment.termMonths: Term must be 1 to 120 months",
      ]);
    });

    it("rejects bi-weekly withholdings", () => {
      expect(issues({ ...valid.MCA, frequency: "biweekly" })).toEqual(["frequency: Choose daily, weekly or monthly"]);
    });
  });

  describe("grace period", () => {
    it("rejects a grace period as long as the term", () => {
      expect(issues({ ...valid.GRACE_PERIOD, gracePeriodMonths: 36 })).toEqual([
        "gracePeriodMonths: Grace period must be shorter than the term",
      ]);
    });

    it("rejects a fractional grace period", () => {
      expect(issues({ ...valid.GRACE_PERIOD, gracePeriodMonths: 2.5 })).toEqual([
        "gracePeriodMonths: Grace period must be a whole number of months",
      ]);
    });
  });

  describe("equipment financing", () => {
    it("rejects a down payment at or above the price", () => {
      expect(issues({ ...valid.EQUIPMENT, downPayment: { kind: "percent", value: 100 } })).toEqual([
        "downPayment.value: Down payment must be less than the purchase price",
      ]);
    });

    it("rejects a residual at or above the financed amount", () => {
      expect(issues({ ...valid.EQUIPMENT, residualValue: 120_000 })).toEqual([
        "residualValue: Residual value must be less than the amount financed",
      ]);
    });
  });

  describe("fees (REQ-FUNC-BL02: flat or % of total)", () => {
    it("accepts flat and percentage fees", () => {
      expect(
        issues({
          ...valid.TERM_SBA,
          fees: [
            { label: "Origination", amount: { kind: "percent", value: 2 } },
            { label: "SBA guarantee", amount: { kind: "flat", value: 1_500 } },
          ],
        }),
      ).toEqual([]);
    });

    it("rejects a percentage fee over 100%", () => {
      expect(issues({ ...valid.TERM_SBA, fees: [{ label: "Origination", amount: { kind: "percent", value: 101 } }] })).toEqual([
        "fees.0.amount.value: Percentage must be between 0% and 100%",
      ]);
    });

    it("rejects a blank fee label", () => {
      expect(issues({ ...valid.TERM_SBA, fees: [{ label: "  ", amount: { kind: "flat", value: 10 } }] })).toEqual([
        "fees.0.label: Name the fee",
      ]);
    });
  });
});
