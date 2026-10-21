import { useLayoutEffect } from "react";

/** Set when the user changes an input. */
export const INPUT_MARK = "loancalc:input";
/** Input → committed re-render of results, table and charts (REQ-NFR-PERF1). */
export const RECALC_MEASURE = "loancalc:recalc";

export function markInput(): void {
  performance.mark(INPUT_MARK);
}

/**
 * Records a RECALC_MEASURE entry each time `result` commits after an input,
 * so the E2E suite can assert the <50 ms budget from the browser's own timeline.
 */
export function useRecalcMeasure(result: unknown): void {
  useLayoutEffect(() => {
    if (performance.getEntriesByName(INPUT_MARK, "mark").length === 0) return;
    performance.measure(RECALC_MEASURE, INPUT_MARK);
    performance.clearMarks(INPUT_MARK);
  }, [result]);
}
