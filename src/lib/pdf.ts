import type { ScheduleRow } from "@/engine";
import { CSV_HEADER } from "./csv";
import { formatCents } from "./format";

export const PDF_FILENAME = "loan-amortization-schedule.pdf";

interface SchedulePdf {
  heading: string;
  summary: readonly { label: string; value: string }[];
  rows: readonly ScheduleRow[];
}

/**
 * Summary report as a PDF, generated in the browser from SPA state (REQ-FUNC-DB03).
 * jsPDF is imported on demand so it never weighs on the initial page load.
 */
export async function buildSchedulePdf({ heading, summary, rows }: SchedulePdf): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: false });
  const margin = 40;

  doc.setFontSize(16);
  doc.text(heading, margin, 48);

  autoTable(doc, {
    startY: 64,
    margin: { left: margin, right: margin },
    theme: "plain",
    body: summary.map((item) => [item.label, item.value]),
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { textColor: 90 }, 1: { fontStyle: "bold", halign: "right" } },
    tableWidth: 280,
  });

  const afterSummary = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 64;
  doc.setFontSize(12);
  doc.text("Amortization schedule", margin, afterSummary + 28);

  autoTable(doc, {
    startY: afterSummary + 36,
    margin: { left: margin, right: margin },
    head: [[...CSV_HEADER]],
    body: rows.map((row) => [
      row.period === 0 ? "Closing" : String(row.period),
      row.date,
      formatCents(row.paymentCents),
      formatCents(row.principalCents),
      formatCents(row.interestCents),
      formatCents(row.feesCents),
      formatCents(row.balanceCents),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [39, 39, 42] },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
  });

  return doc.output("blob");
}
