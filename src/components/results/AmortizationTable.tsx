"use client";

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ScheduleRow } from "@/engine";
import { formatCents } from "@/lib/format";

const PAGE_SIZES = [12, 24, 60] as const;
type PageSize = (typeof PAGE_SIZES)[number] | "all";

const ROW_HEIGHT = 36;
const VIRTUAL_HEIGHT = 480;

/** Same columns, in the same order, as the CSV export (REQ-FUNC-DB03). */
const COLUMNS = ["Period", "Date", "Payment", "Principal", "Interest", "Fees", "Remaining Balance"] as const;

const cellClass = "px-3 py-2 text-right tabular-nums whitespace-nowrap";

/**
 * Full amortization schedule (REQ-FUNC-AN01): paginated by default, or every row
 * in a virtualized scroll area, so a 2,520-row schedule never renders 2,520 rows.
 */
export function AmortizationTable({ rows }: { rows: readonly ScheduleRow[] }) {
  const [pageSize, setPageSize] = useState<PageSize>(12);
  const [page, setPage] = useState(0);

  const paymentCount = rows.filter((row) => row.period > 0).length;
  const pageCount = pageSize === "all" ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  // Clamp rather than reset, so editing an input doesn't throw the reader back to page 1.
  const current = Math.min(page, pageCount - 1);
  const offset = pageSize === "all" ? 0 : current * pageSize;
  const visible = pageSize === "all" ? rows : rows.slice(offset, offset + pageSize);

  const periods = visible.filter((row) => row.period > 0).map((row) => row.period);
  const statusText =
    pageSize === "all"
      ? `All ${paymentCount} payments`
      : periods.length > 0
        ? `Showing payments ${periods[0]}–${periods.at(-1)} of ${paymentCount}`
        : `Closing costs · ${paymentCount} payments`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {statusText}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="rows-per-page" className="text-sm text-zinc-600 dark:text-zinc-400">
            Rows per page
          </label>
          <select
            id="rows-per-page"
            value={String(pageSize)}
            onChange={(event) => {
              const value = event.target.value;
              setPageSize(value === "all" ? "all" : (Number(value) as PageSize));
              setPage(0);
            }}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {pageSize === "all" ? (
        <VirtualTable rows={rows} />
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <Table rowCount={rows.length}>
            {visible.map((row, i) => (
              <Row key={row.period} row={row} rowIndex={offset + i + 2} />
            ))}
          </Table>
        </div>
      )}

      {pageSize !== "all" && pageCount > 1 && (
        <nav aria-label="Schedule pages" className="flex items-center justify-end gap-1">
          <PageButton label="First page" symbol="«" disabled={current === 0} onClick={() => setPage(0)} />
          <PageButton label="Previous page" symbol="‹" disabled={current === 0} onClick={() => setPage(current - 1)} />
          <span className="px-2 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
            Page {current + 1} of {pageCount}
          </span>
          <PageButton
            label="Next page"
            symbol="›"
            disabled={current === pageCount - 1}
            onClick={() => setPage(current + 1)}
          />
          <PageButton
            label="Last page"
            symbol="»"
            disabled={current === pageCount - 1}
            onClick={() => setPage(pageCount - 1)}
          />
        </nav>
      )}
    </div>
  );
}

function VirtualTable({ rows }: { rows: readonly ScheduleRow[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual's API returns functions the React Compiler can't memoize; that's expected here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    initialRect: { width: 0, height: VIRTUAL_HEIGHT },
  });
  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);

  return (
    <div
      ref={scrollRef}
      style={{ maxHeight: VIRTUAL_HEIGHT }}
      className="overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <Table rowCount={rows.length}>
        {paddingTop > 0 && <tr aria-hidden="true" style={{ height: paddingTop }} />}
        {items.map((item) => (
          <Row key={item.key} row={rows[item.index]!} rowIndex={item.index + 2} />
        ))}
        {paddingBottom > 0 && <tr aria-hidden="true" style={{ height: paddingBottom }} />}
      </Table>
    </div>
  );
}

function Table({ rowCount, children }: { rowCount: number; children: React.ReactNode }) {
  return (
    <table aria-rowcount={rowCount + 1} className="w-full border-collapse text-sm">
      <caption className="sr-only">Amortization schedule</caption>
      <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
        <tr aria-rowindex={1}>
          {COLUMNS.map((column, i) => (
            <th
              key={column}
              scope="col"
              className={`${i === 0 ? "text-left" : "text-right"} px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400`}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Row({ row, rowIndex }: { row: ScheduleRow; rowIndex: number }) {
  return (
    <tr aria-rowindex={rowIndex} style={{ height: ROW_HEIGHT }} className="border-t border-zinc-100 dark:border-zinc-800">
      <th scope="row" className="px-3 py-2 text-left font-normal tabular-nums">
        {row.period === 0 ? "Closing" : row.period}
      </th>
      <td className={cellClass}>{row.date}</td>
      <td className={cellClass}>{formatCents(row.paymentCents)}</td>
      <td className={cellClass}>{formatCents(row.principalCents)}</td>
      <td className={cellClass}>{formatCents(row.interestCents)}</td>
      <td className={cellClass}>{formatCents(row.feesCents)}</td>
      <td className={cellClass}>{formatCents(row.balanceCents)}</td>
    </tr>
  );
}

function PageButton({
  label,
  symbol,
  disabled,
  onClick,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 min-w-8 rounded-md border border-zinc-300 px-2 text-sm disabled:opacity-40 dark:border-zinc-700"
    >
      <span aria-hidden="true">{symbol}</span>
    </button>
  );
}
