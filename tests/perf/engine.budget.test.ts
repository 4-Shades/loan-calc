import { describe, expect, it } from "vitest";
import { buildMerchantCashAdvance, buildSchedule } from "@/engine";
import { evaluateForm, DEFAULT_VALUES } from "@/components/calculator/formModel";

/**
 * REQ-NFR-PERF1 budget: a full recalculation must leave most of the 50 ms window
 * for React to render. Medians over many runs, after warm-up, to resist noise.
 * Run on its own (npm run test:perf), not alongside the parallel property tests.
 */
function medianMs(fn: () => unknown, runs = 40): number {
  for (let i = 0; i < 5; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]!;
}

describe("engine performance budget (REQ-NFR-PERF1)", () => {
  it("builds a 360-period schedule in under 5 ms", () => {
    const ms = medianMs(() =>
      buildSchedule({ principalCents: 50_000_000, aprPercent: 7.5, periods: 360, frequency: "monthly", startDate: "2026-01-15" }),
    );
    expect(ms).toBeLessThan(5);
  });

  it("validates and calculates the form in under 5 ms", () => {
    const ms = medianMs(() => evaluateForm("FIXED_INSTALLMENT", DEFAULT_VALUES.FIXED_INSTALLMENT, "2026-01-15"));
    expect(ms).toBeLessThan(5);
  });

  it("handles the largest schedule (10-year daily MCA, 2,520 rows) in under 25 ms", () => {
    const ms = medianMs(() =>
      buildMerchantCashAdvance({
        advanceCents: 5_000_000,
        factorRate: 1.5,
        frequency: "daily",
        repayment: { kind: "fixedTerm", termMonths: 120 },
        startDate: "2026-01-15",
      }),
    );
    expect(ms).toBeLessThan(25);
  });
});
