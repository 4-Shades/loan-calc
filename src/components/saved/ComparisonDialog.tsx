"use client";

import { useEffect, useId, useRef } from "react";
import { buildComparison, type Highlight, type SavedItem } from "@/lib/comparison";

const HIGHLIGHT: Record<Highlight, { className: string; badge: string }> = {
  "lowest-cost": {
    className: "bg-green-50 text-green-900 ring-2 ring-inset ring-green-600 dark:bg-green-950 dark:text-green-100",
    badge: "Lowest cost",
  },
  "lowest-payment": {
    className: "bg-blue-50 text-blue-900 ring-2 ring-inset ring-blue-600 dark:bg-blue-950 dark:text-blue-100",
    badge: "Lowest payment",
  },
};

interface ComparisonDialogProps {
  items: readonly SavedItem[];
  onClose: () => void;
}

/**
 * Side-by-side comparison modal (REQ-FUNC-DB02): one column per saved calculation.
 * Lowest cost is green, lowest monthly payment blue, each with a text badge so the
 * meaning never depends on color alone.
 */
export function ComparisonDialog({ items, onClose }: ComparisonDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const comparison = buildComparison(items);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-full w-full max-w-4xl flex-col gap-4 overflow-auto rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-950 dark:ring-1 dark:ring-zinc-700"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-xl font-semibold">
            Comparison Matrix
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Close
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Saved calculations compared side by side</caption>
            <thead>
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
                  Metric
                </th>
                {comparison.columns.map((column) => (
                  <th key={column.id} scope="col" className="px-3 py-2 text-right font-semibold">
                    {column.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-zinc-600 dark:text-zinc-400">
                    {row.label}
                  </th>
                  {row.values.map((value, index) => {
                    const highlight = row.highlight && row.best.includes(index) ? row.highlight : undefined;
                    return (
                      <td
                        key={comparison.columns[index]!.id}
                        data-highlight={highlight}
                        className={`px-3 py-2 text-right tabular-nums ${highlight ? `rounded-md ${HIGHLIGHT[highlight].className}` : ""}`}
                      >
                        {value}
                        {highlight && (
                          <span className="ml-2 inline-block rounded px-1.5 text-xs font-semibold uppercase tracking-wide">
                            {HIGHLIGHT[highlight].badge}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">
          Monthly payment is the regular payment converted to a monthly equivalent. Cost of borrowing counts
          interest and fees, so a factor-rate advance compares fairly with an interest-bearing loan.
        </p>
      </div>
    </div>
  );
}
