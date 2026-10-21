import { expect } from "@playwright/test";
import { fixedPaymentCents } from "../../../src/engine/payment";
import { Then, When, formatUsd, summaryValue } from "./fixtures";

const RECALC_MEASURE = "loancalc:recalc";
const APR_STEP = 0.01;

// Scenario: real-time dynamic recalculation on UI slider adjustment (REQ-UI-001, REQ-NFR-PERF1)
When("the user drags the APR input slider from {float}% to {float}%", async ({ page }, from: number, to: number) => {
  const slider = page.getByRole("slider", { name: "APR (%) slider" });
  await expect(slider).toHaveValue(String(from));
  await page.evaluate((name) => performance.clearMeasures(name), RECALC_MEASURE);

  // Keyboard steps are real input events, one per 0.01%: 250 recalculations from 5.00 to 7.50.
  await slider.focus();
  const steps = Math.round((to - from) / APR_STEP);
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(slider).toHaveValue(String(to));
});

Then("the client-side WebAssembly\\/TypeScript calculation engine re-evaluates the schedule", async ({ page }) => {
  await expect(page.getByLabel("APR (%)", { exact: true })).toHaveValue("7.5");
  const expected = fixedPaymentCents({ principalCents: 1_000_000, aprPercent: 7.5, periods: 24, frequency: "monthly" });
  await expect(summaryValue(page, "Regular payment")).toHaveText(formatUsd(expected / 100));
});

Then(
  "the total recalculation time and UI re-render completes in under {int} milliseconds",
  async ({ page, $testInfo: testInfo }, budgetMs: number) => {
    const durations = await page.evaluate(
      (name) => performance.getEntriesByName(name).map((entry) => entry.duration),
      RECALC_MEASURE,
    );
    expect(durations.length).toBeGreaterThanOrEqual(200);

    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    const max = sorted.at(-1)!;
    const median = sorted[Math.floor(sorted.length / 2)]!;
    testInfo.annotations.push({
      type: "perf",
      description: `${durations.length} recalculations: median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${max.toFixed(1)} ms`,
    });
    expect(p95).toBeLessThan(budgetMs);
  },
);

Then("no full browser page reload is performed", async ({ page, spa }) => {
  expect(spa.navigations).toBe(1);
  expect(await page.evaluate(() => "__spaSession" in window)).toBe(true);
});
