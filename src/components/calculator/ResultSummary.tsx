import type { CalculationResult } from "@/lib/calculateLoan";
import { formatCents, formatPercent } from "@/lib/format";

type Item = { label: string; value: string };

/** Headline figures for a calculation. The full schedule and charts arrive in Slice 5. */
export function ResultSummary({ result }: { result: CalculationResult }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {summaryItems(result).map((item) => (
        <div key={item.label} className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">{item.label}</dt>
          <dd className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label/value pairs shown in the summary; the PDF export reuses them. */
export function summaryItems(result: CalculationResult): Item[] {
  const { summary, rows } = result.schedule;
  const payments = { label: "Number of payments", value: String(summary.periods) };
  const totalPaid = { label: "Total paid", value: formatCents(summary.totalPaidCents) };
  const interest = { label: "Total interest", value: formatCents(summary.totalInterestCents) };

  switch (result.loanType) {
    case "FIXED_INSTALLMENT": {
      const items = [
        { label: "Regular payment", value: formatCents(summary.regularPaymentCents) },
        interest,
        payments,
        totalPaid,
      ];
      const impact = result.schedule.summary.extraPaymentImpact;
      if (impact) {
        items.push(
          { label: "Interest saved", value: formatCents(impact.interestSavedCents) },
          { label: "Payments saved", value: String(impact.periodsSaved) },
        );
      }
      return items;
    }
    case "INTEREST_ONLY_BALLOON":
      return [
        { label: "Interest-only payment", value: formatCents(summary.regularPaymentCents) },
        { label: "Final balloon payment", value: formatCents(rows.at(-1)?.paymentCents ?? 0) },
        interest,
        payments,
      ];
    case "REVOLVING":
      return [
        { label: "Initial minimum payment", value: formatCents(summary.regularPaymentCents) },
        interest,
        result.schedule.paidOff
          ? { label: "Months to pay off", value: String(summary.periods) }
          : { label: "Paid off", value: `Not within ${summary.periods} months` },
        totalPaid,
      ];
    case "MCA": {
      const mca = result.schedule.summary;
      return [
        { label: "Withdrawal amount", value: formatCents(mca.regularPaymentCents) },
        { label: "Total payback", value: formatCents(mca.totalPaybackCents) },
        { label: "Finance charge", value: formatCents(mca.financeChargeCents) },
        { label: "Effective APR", value: formatPercent(mca.effectiveAprPercent) },
        payments,
        ...feeItems(mca.upfrontFeesCents, mca.netProceedsCents),
      ];
    }
    case "EQUIPMENT": {
      const equipment = result.schedule.summary;
      return [
        { label: "Amount financed", value: formatCents(equipment.financedCents) },
        { label: "Regular payment", value: formatCents(equipment.regularPaymentCents) },
        { label: "Final balloon payment", value: formatCents(rows.at(-1)?.paymentCents ?? 0) },
        interest,
        { label: "Effective APR", value: formatPercent(equipment.effectiveAprPercent) },
        payments,
        ...feeItems(equipment.upfrontFeesCents, equipment.netProceedsCents),
      ];
    }
    case "TERM_SBA":
    case "GRACE_PERIOD": {
      const business = result.schedule.summary;
      return [
        {
          label: result.loanType === "GRACE_PERIOD" ? "Payment after grace period" : "Regular payment",
          value: formatCents(business.regularPaymentCents),
        },
        interest,
        { label: "Effective APR", value: formatPercent(business.effectiveAprPercent) },
        payments,
        totalPaid,
        ...feeItems(business.upfrontFeesCents, business.netProceedsCents),
      ];
    }
  }
}

function feeItems(upfrontFeesCents: number, netProceedsCents: number): Item[] {
  return upfrontFeesCents > 0
    ? [
        { label: "Upfront fees", value: formatCents(upfrontFeesCents) },
        { label: "Net proceeds", value: formatCents(netProceedsCents) },
      ]
    : [];
}
