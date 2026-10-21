import { describe, expect, it } from "vitest";
import { buildSchedule } from "@/engine";
import { PDF_FILENAME, buildSchedulePdf } from "@/lib/pdf";

const { rows } = buildSchedule({ principalCents: 1_000_000, aprPercent: 5, periods: 24, frequency: "monthly", startDate: "2026-01-15" });

describe("buildSchedulePdf (REQ-FUNC-DB03)", () => {
  it("builds a PDF with the summary and every schedule row", async () => {
    const blob = await buildSchedulePdf({
      heading: "Fixed-Rate Installment Loan",
      summary: [
        { label: "Regular payment", value: "$438.71" },
        { label: "Total interest", value: "$529.15" },
      ],
      rows,
    });
    expect(blob.type).toBe("application/pdf");
    const text = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    for (const expected of ["Fixed-Rate Installment Loan", "Regular payment", "$529.15", "Amortization schedule", "Remaining Balance", "2028-01-15"]) {
      expect(text).toContain(expected);
    }
    expect(PDF_FILENAME).toBe("loan-amortization-schedule.pdf");
  });
});
