"use client";

import { useState } from "react";
import type { ScheduleRow } from "@/engine";
import { CSV_FILENAME, scheduleToCsv } from "@/lib/csv";
import { downloadBlob } from "@/lib/download";
import { PDF_FILENAME, buildSchedulePdf } from "@/lib/pdf";

interface ExportButtonsProps {
  heading: string;
  summary: readonly { label: string; value: string }[];
  rows: readonly ScheduleRow[];
}

const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900";

/** CSV and PDF downloads built from the current page state, no server involved (REQ-FUNC-DB03). */
export function ExportButtons({ heading, summary, rows }: ExportButtonsProps) {
  const [pdfState, setPdfState] = useState<"idle" | "building" | "failed">("idle");

  function exportCsv() {
    downloadBlob(new Blob([scheduleToCsv(rows)], { type: "text/csv;charset=utf-8" }), CSV_FILENAME);
  }

  async function exportPdf() {
    setPdfState("building");
    try {
      downloadBlob(await buildSchedulePdf({ heading, summary, rows }), PDF_FILENAME);
      setPdfState("idle");
    } catch (error) {
      console.error("PDF export failed", error);
      setPdfState("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={exportCsv} className={buttonClass}>
        Export CSV
      </button>
      <button type="button" onClick={exportPdf} disabled={pdfState === "building"} className={buttonClass}>
        Export PDF
      </button>
      {pdfState === "building" && <span className="text-sm text-zinc-500 dark:text-zinc-400">Preparing PDF…</span>}
      {pdfState === "failed" && (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t create the PDF. Please try again.
        </span>
      )}
    </div>
  );
}
