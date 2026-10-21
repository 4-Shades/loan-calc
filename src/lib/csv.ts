import type { ScheduleRow } from "@/engine";

export const CSV_FILENAME = "loan-amortization-schedule.csv";

/** Same columns, in the same order, as the on-screen schedule (REQ-FUNC-DB03). */
export const CSV_HEADER = ["Period", "Date", "Payment", "Principal", "Interest", "Fees", "Remaining Balance"] as const;

/**
 * One CSV cell (RFC 4180). Text that a spreadsheet would run as a formula
 * (=, +, -, @, tab, carriage return) is prefixed with an apostrophe; numbers
 * are written as-is so they stay numeric.
 */
export function escapeCsvCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const amount = (cents: number) => (cents / 100).toFixed(2);

/** The amortization schedule as CSV, CRLF line endings, amounts as plain decimals. */
export function scheduleToCsv(rows: readonly ScheduleRow[]): string {
  const lines = [CSV_HEADER.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.period,
        row.date,
        amount(row.paymentCents),
        amount(row.principalCents),
        amount(row.interestCents),
        amount(row.feesCents),
        amount(row.balanceCents),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
