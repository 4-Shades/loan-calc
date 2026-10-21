import { describe, expect, it } from "vitest";
import { calculateLoan } from "@/lib/calculateLoan";
import { LOAN_TYPES, loanInputSchema, type LoanInput } from "@/schemas/loanInput";

const base = { aprPercent: 5, frequency: "monthly", startDate: "2026-01-15" } as const;

const parse = (input: unknown): LoanInput => loanInputSchema.parse(input);

function expectOk(outcome: ReturnType<typeof calculateLoan>) {
  if (!outcome.ok) throw new Error(`Expected a result, got: ${outcome.error}`);
  return outcome.result;
}

describe("calculateLoan (dispatcher from validated input to engine)", () => {
  it("converts dollars and terms for a fixed-rate loan (BDD Scenario Outline row 1)", () => {
    const result = expectOk(
      calculateLoan(parse({ ...base, loanType: "FIXED_INSTALLMENT", principal: 10_000, term: { value: 2, unit: "years" } })),
    );
    expect(result.loanType).toBe("FIXED_INSTALLMENT");
    expect(result.schedule.summary.regularPaymentCents).toBe(43_871);
    expect(result.schedule.summary.totalInterestCents).toBe(52_915);
    expect(result.schedule.rows).toHaveLength(24);
  });

  it("passes extra payments through (BDD PL03)", () => {
    const result = expectOk(
      calculateLoan(
        parse({
          ...base,
          loanType: "FIXED_INSTALLMENT",
          principal: 20_000,
          aprPercent: 6,
          term: { value: 48, unit: "months" },
          extraPayments: { recurring: 100 },
        }),
      ),
    );
    expect(result.schedule.summary.extraPaymentImpact).toEqual({ periodsSaved: 9, interestSavedCents: 49_821 });
  });

  it("builds a revolving schedule (BDD revolving LOC)", () => {
    const result = expectOk(
      calculateLoan(parse({ loanType: "REVOLVING", balance: 8_000, aprPercent: 18, minimumPaymentPercent: 2.5, startDate: "2026-01-15" })),
    );
    expect(result.schedule.rows[0]).toMatchObject({ paymentCents: 20_000, interestCents: 12_000, principalCents: 8_000 });
  });

  it("builds an MCA with effective APR (BDD MCA)", () => {
    const result = expectOk(
      calculateLoan(
        parse({
          loanType: "MCA",
          advance: 50_000,
          factorRate: 1.25,
          frequency: "daily",
          repayment: { kind: "fixedTerm", termMonths: 6 },
          startDate: "2026-01-15",
        }),
      ),
    );
    if (result.loanType !== "MCA") throw new Error("wrong type");
    expect(result.schedule.summary.totalPaybackCents).toBe(6_250_000);
    expect(result.schedule.summary.effectiveAprPercent).toBeCloseTo(92.219, 2);
  });

  it("converts grace months to periods (BDD grace period)", () => {
    const result = expectOk(
      calculateLoan(
        parse({ ...base, loanType: "GRACE_PERIOD", principal: 100_000, aprPercent: 7.5, term: { value: 3, unit: "years" }, gracePeriodMonths: 6 }),
      ),
    );
    expect(result.schedule.rows.slice(0, 6).every((r) => r.paymentCents === 62_500 && r.principalCents === 0)).toBe(true);
    expect(result.schedule.rows[6]?.paymentCents).toBe(366_597);
  });

  it("finances equipment net of the down payment (BDD equipment)", () => {
    const result = expectOk(
      calculateLoan(
        parse({
          ...base,
          loanType: "EQUIPMENT",
          purchasePrice: 150_000,
          downPayment: { kind: "percent", value: 20 },
          residualValue: 15_000,
          aprPercent: 6.5,
          term: { value: 48, unit: "months" },
        }),
      ),
    );
    if (result.loanType !== "EQUIPMENT") throw new Error("wrong type");
    expect(result.schedule.summary.financedCents).toBe(12_000_000);
    expect(result.schedule.rows.at(-1)?.paymentCents).toBe(1_757_137);
  });

  it("applies term/SBA fees", () => {
    const result = expectOk(
      calculateLoan(
        parse({
          ...base,
          loanType: "TERM_SBA",
          principal: 100_000,
          aprPercent: 7.5,
          term: { value: 10, unit: "years" },
          fees: [
            { label: "Origination", amount: { kind: "percent", value: 2 } },
            { label: "SBA guarantee", amount: { kind: "flat", value: 1_500 } },
          ],
        }),
      ),
    );
    if (result.loanType !== "TERM_SBA") throw new Error("wrong type");
    expect(result.schedule.summary.upfrontFeesCents).toBe(350_000);
    expect(result.schedule.summary.effectiveAprPercent).toBeCloseTo(8.3166, 3);
  });

  it.each(LOAN_TYPES)("handles every loan type (%s)", (loanType) => {
    // Exhaustiveness: the dispatcher has a branch for each schema member.
    const inputs: Record<string, unknown> = {
      FIXED_INSTALLMENT: { ...base, loanType, principal: 5_000, term: { value: 12, unit: "months" } },
      INTEREST_ONLY_BALLOON: { ...base, loanType, principal: 5_000, term: { value: 12, unit: "months" } },
      REVOLVING: { loanType, balance: 5_000, aprPercent: 18, minimumPaymentPercent: 3, startDate: "2026-01-15" },
      TERM_SBA: { ...base, loanType, principal: 5_000, term: { value: 12, unit: "months" } },
      EQUIPMENT: { ...base, loanType, purchasePrice: 5_000, downPayment: { kind: "flat", value: 0 }, residualValue: 0, term: { value: 12, unit: "months" } },
      MCA: { loanType, advance: 5_000, factorRate: 1.2, frequency: "weekly", repayment: { kind: "fixedTerm", termMonths: 6 }, startDate: "2026-01-15" },
      GRACE_PERIOD: { ...base, loanType, principal: 5_000, term: { value: 12, unit: "months" }, gracePeriodMonths: 3 },
    };
    expect(expectOk(calculateLoan(parse(inputs[loanType]))).loanType).toBe(loanType);
  });

  describe("domain errors become readable messages instead of exceptions", () => {
    it("explains a loan that cannot amortize at cent precision", () => {
      const outcome = calculateLoan(
        parse({ ...base, loanType: "FIXED_INSTALLMENT", principal: 100_000, aprPercent: 50, term: { value: 30, unit: "years" } }),
      );
      expect(outcome).toEqual({
        ok: false,
        error: "At this rate and term the payment never reduces the balance. Shorten the term or lower the APR.",
      });
    });

    it("explains a revolving minimum that does not cover interest", () => {
      const outcome = calculateLoan(
        parse({ loanType: "REVOLVING", balance: 8_000, aprPercent: 18, minimumPaymentPercent: 1, startDate: "2026-01-15" }),
      );
      expect(outcome).toEqual({
        ok: false,
        error: "The minimum payment doesn't cover the monthly interest, so the balance would never go down. Raise the minimum percentage.",
      });
    });

    it("explains fees that consume the whole loan", () => {
      const outcome = calculateLoan(
        parse({
          ...base,
          loanType: "TERM_SBA",
          principal: 1_000,
          term: { value: 12, unit: "months" },
          fees: [{ label: "Origination", amount: { kind: "flat", value: 1_000 } }],
        }),
      );
      expect(outcome).toEqual({ ok: false, error: "Upfront fees must be less than the loan amount." });
    });

    it("explains a revenue share that is too slow", () => {
      const outcome = calculateLoan(
        parse({
          loanType: "MCA",
          advance: 50_000,
          factorRate: 1.25,
          frequency: "daily",
          repayment: { kind: "revenueShare", holdbackPercent: 1, revenuePerPeriod: 10 },
          startDate: "2026-01-15",
        }),
      );
      expect(outcome).toEqual({
        ok: false,
        error: "At this holdback and revenue the advance would take more than 10 years to repay.",
      });
    });

    it("explains an advance too small for its withdrawals", () => {
      const outcome = calculateLoan(
        // $150 payback over 2,520 daily withdrawals: 5.95¢ rounds up to 6¢, overshooting the payback.
        parse({ loanType: "MCA", advance: 100, factorRate: 1.5, frequency: "daily", repayment: { kind: "fixedTerm", termMonths: 120 }, startDate: "2026-01-15" }),
      );
      expect(outcome).toEqual({ ok: false, error: "The advance is too small to split across that many withdrawals." });
    });
  });
});
