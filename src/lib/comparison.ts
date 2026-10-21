import { LOAN_TYPE_LABELS, type LoanType } from "@/schemas/loanInput";
import type { StoredSummary } from "@/schemas/saveCalculation";
import { formatCents, formatPercent } from "./format";

/** One entry from GET /api/calculations. */
export interface SavedItem {
  id: string;
  title: string;
  loanType: string;
  createdAt: string;
  summary: StoredSummary;
}

export type Highlight = "lowest-cost" | "lowest-payment";

export interface ComparisonRow {
  key: string;
  label: string;
  values: string[];
  /** Highlighted metrics only: indexes of the columns that tie for the lowest value. */
  best: number[];
  highlight?: Highlight;
}

export interface Comparison {
  columns: { id: string; title: string }[];
  rows: ComparisonRow[];
}

/** Monthly-equivalent payment; older saves only have the per-period payment. */
const monthly = (summary: StoredSummary) => summary.monthlyPaymentCents ?? summary.regularPaymentCents;
/** Cost of borrowing: an MCA's factor charge is a fee, so interest alone would make it look free. */
const cost = (summary: StoredSummary) => summary.totalInterestCents + summary.totalFeesCents;

function lowest(values: number[]): number[] {
  const min = Math.min(...values);
  return values.flatMap((value, index) => (value === min ? [index] : []));
}

/**
 * Side-by-side comparison of saved calculations (REQ-FUNC-DB02). The lowest cost
 * of borrowing and the lowest monthly payment are marked; ties mark every winner.
 */
export function buildComparison(items: readonly SavedItem[]): Comparison {
  const summaries = items.map((item) => item.summary);
  const plain = (key: string, label: string, values: string[]): ComparisonRow => ({ key, label, values, best: [] });

  return {
    columns: items.map(({ id, title }) => ({ id, title })),
    rows: [
      plain(
        "type",
        "Loan type",
        items.map((item) => LOAN_TYPE_LABELS[item.loanType as LoanType] ?? item.loanType),
      ),
      plain(
        "category",
        "Category",
        summaries.map((s) => (s.category === "PERSONAL" ? "Personal" : "Business")),
      ),
      plain("amount", "Loan amount", summaries.map((s) => formatCents(s.loanAmountCents))),
      {
        key: "monthly",
        label: "Monthly payment",
        values: summaries.map((s) => formatCents(monthly(s))),
        best: lowest(summaries.map(monthly)),
        highlight: "lowest-payment",
      },
      {
        key: "cost",
        label: "Total interest & fees",
        values: summaries.map((s) => formatCents(cost(s))),
        best: lowest(summaries.map(cost)),
        highlight: "lowest-cost",
      },
      plain("paid", "Total paid", summaries.map((s) => formatCents(s.totalPaidCents))),
      plain(
        "apr",
        "Effective APR",
        summaries.map((s) => (s.effectiveAprPercent === null ? "—" : formatPercent(s.effectiveAprPercent))),
      ),
      plain("periods", "Number of payments", summaries.map((s) => String(s.periods))),
    ],
  };
}
