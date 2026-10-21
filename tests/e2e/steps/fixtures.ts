import { expect, type Locator, type Page } from "@playwright/test";
import { createBdd, test as base } from "playwright-bdd";

interface SpaTracker {
  /** Full document loads since the test started; 1 after the first page load, more only on a reload. */
  navigations: number;
}

export const test = base.extend<{ spa: SpaTracker; ctx: Record<string, unknown> }>({
  // Fixture callbacks are named `provide` (not Playwright's usual `use`) so React's
  // hooks lint rule doesn't mistake them for React's use() hook.

  /** Per-scenario scratch space for values one step hands to a later one. */
  ctx: async ({}, provide) => {
    await provide({});
  },
  // Auto: set up before Background hooks run, so the very first load is counted.
  // `load` fires only for full documents, not for in-page history updates.
  spa: [
    async ({ page }, provide) => {
      const spa: SpaTracker = { navigations: 0 };
      page.on("load", () => {
        spa.navigations++;
      });
      await provide(spa);
    },
    { auto: true },
  ],
});

export const { Given, When, Then, After } = createBdd(test);

/** "$20,000" / "62,500.00" → 20000 / 62500 */
export function parseMoney(text: string): number {
  return Number(text.replace(/[$,]/g, ""));
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatUsd = (dollars: number) => usd.format(dollars);

export function results(page: Page): Locator {
  return page.getByRole("region", { name: "Results" });
}

/** The value shown next to a summary label in the Results region. */
export function summaryValue(page: Page, label: string): Locator {
  return results(page)
    .locator("dt", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .locator("xpath=following-sibling::dd");
}

export async function summaryNumber(page: Page, label: string): Promise<number> {
  const text = await summaryValue(page, label).textContent();
  return Number((text ?? "").replace(/[$,%]/g, ""));
}

export async function fill(page: Page, label: string, value: string | number): Promise<void> {
  await page.getByLabel(label, { exact: true }).fill(String(value));
}

/** Cells of a schedule row, by payment number: [date, payment, principal, interest, fees, balance]. */
export function scheduleRow(page: Page, period: number): Locator {
  return page
    .getByRole("table", { name: "Amortization schedule" })
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: String(period), exact: true }) })
    .getByRole("cell");
}

export const COLUMN = { date: 0, payment: 1, principal: 2, interest: 3, fees: 4, balance: 5 } as const;

export async function waitForResult(page: Page): Promise<void> {
  await expect(results(page).locator("dl")).toBeVisible();
  // Scoped: Next.js renders its own (empty) route-announcer alert on every page.
  await expect(results(page).getByRole("alert")).toHaveCount(0);
}
