import { describe, expect, it } from "vitest";
import { buildComparison, type SavedItem } from "@/lib/comparison";

function item(title: string, overrides: Partial<SavedItem["summary"]> = {}, loanType = "TERM_SBA"): SavedItem {
  return {
    id: `${title}-id`,
    title,
    loanType,
    createdAt: "2026-10-21T08:00:00.000Z",
    summary: {
      category: "BUSINESS",
      loanAmountCents: 10_000_000,
      regularPaymentCents: 300_000,
      monthlyPaymentCents: 300_000,
      totalInterestCents: 1_000_000,
      totalFeesCents: 0,
      totalPaidCents: 11_000_000,
      periods: 36,
      effectiveAprPercent: 7.2,
      ...overrides,
    },
  };
}

// The BDD comparison-matrix fixtures (features/persistence.feature).
const bdd = [
  item("Bank Term Loan", { monthlyPaymentCents: 309_664, totalInterestCents: 1_147_904, effectiveAprPercent: 7.2 }),
  item("MCA Option", { monthlyPaymentCents: 416_666, totalInterestCents: 2_499_980, effectiveAprPercent: 42.5 }),
  item("Equipment Lease", { monthlyPaymentCents: 235_367, totalInterestCents: 1_297_616, effectiveAprPercent: 6.1 }),
];

const row = (comparison: ReturnType<typeof buildComparison>, key: string) => comparison.rows.find((r) => r.key === key)!;

describe("buildComparison (REQ-FUNC-DB02)", () => {
  it("puts each saved calculation in its own column", () => {
    expect(buildComparison(bdd).columns.map((c) => c.title)).toEqual(["Bank Term Loan", "MCA Option", "Equipment Lease"]);
  });

  it("marks the lowest total cost of borrowing (interest + fees)", () => {
    expect(row(buildComparison(bdd), "cost")).toMatchObject({
      label: "Total interest & fees",
      values: ["$11,479.04", "$24,999.80", "$12,976.16"],
      highlight: "lowest-cost",
      best: [0],
    });
  });

  it("marks the lowest monthly payment", () => {
    expect(row(buildComparison(bdd), "monthly")).toMatchObject({
      label: "Monthly payment",
      values: ["$3,096.64", "$4,166.66", "$2,353.67"],
      highlight: "lowest-payment",
      best: [2],
    });
  });

  it("counts fees as cost, so a merchant cash advance doesn't look interest-free", () => {
    const comparison = buildComparison([
      item("Loan", { totalInterestCents: 1_000_000, totalFeesCents: 0 }),
      item("MCA", { totalInterestCents: 0, totalFeesCents: 2_500_000 }, "MCA"),
    ]);
    expect(row(comparison, "cost").best).toEqual([0]);
  });

  it("highlights every option that ties for lowest", () => {
    const comparison = buildComparison([item("A"), item("B"), item("C", { monthlyPaymentCents: 400_000 })]);
    expect(row(comparison, "monthly").best).toEqual([0, 1]);
  });

  it("shows loan type, category, amount, totals, effective APR and payments", () => {
    const comparison = buildComparison([
      item("Personal", { category: "PERSONAL", effectiveAprPercent: null }, "FIXED_INSTALLMENT"),
      item("Business"),
    ]);
    expect(comparison.rows.map((r) => r.label)).toEqual([
      "Loan type",
      "Category",
      "Loan amount",
      "Monthly payment",
      "Total interest & fees",
      "Total paid",
      "Effective APR",
      "Number of payments",
    ]);
    expect(row(comparison, "type").values).toEqual(["Fixed-Rate Installment Loan", "Term / SBA Loan"]);
    expect(row(comparison, "category").values).toEqual(["Personal", "Business"]);
    expect(row(comparison, "apr").values).toEqual(["—", "7.20%"]);
  });

  it("falls back to the regular payment for calculations saved before monthly equivalents were stored", () => {
    const legacy = item("Legacy", { regularPaymentCents: 123_456 });
    delete (legacy.summary as { monthlyPaymentCents?: number }).monthlyPaymentCents;
    expect(row(buildComparison([legacy, item("New")]), "monthly").values[0]).toBe("$1,234.56");
  });
});
