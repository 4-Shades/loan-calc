import { readFile } from "node:fs/promises";
import { expect, type Download, type Locator } from "@playwright/test";
import type { DataTable } from "playwright-bdd";
import { Client } from "pg";
import { Given, Then, When, fill, parseMoney, waitForResult } from "./fixtures";

interface Seeded {
  title: string;
  /** Title as stored: suffixed per run so leftovers from an interrupted run can't be confused with it. */
  storedTitle: string;
  monthlyCents: number;
  interestCents: number;
}

const toCents = (money: string) => Math.round(parseMoney(money) * 100);

/**
 * Background colour of an element as sRGB [r, g, b]. Tailwind 4 colours are oklch(),
 * so let the browser convert by painting the colour onto a 1×1 canvas.
 */
async function rgb(locator: Locator): Promise<[number, number, number]> {
  return locator.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = getComputedStyle(el).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r!, g!, b!] as [number, number, number];
  });
}

// Scenario: display side-by-side comparison matrix for up to 3 saved scenarios (REQ-FUNC-DB02)
Given(
  "the user has {int} saved calculations in PostgreSQL:",
  async ({ page, ctx }, count: number, table: DataTable) => {
    const rows = table.hashes();
    expect(rows).toHaveLength(count);
    const run = Date.now().toString(36);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const seeded: Seeded[] = [];
    const ids: string[] = [];
    try {
      for (const row of rows) {
        const amount = toCents(row["Loan Amount"]!);
        const monthly = toCents(row["Monthly Payment"]!);
        const interest = toCents(row["Total Interest"]!);
        const storedTitle = `${row.Title} [${run}]`;
        const summary = {
          category: row.Category!.toUpperCase(),
          loanAmountCents: amount,
          regularPaymentCents: monthly,
          monthlyPaymentCents: monthly,
          totalInterestCents: interest,
          totalFeesCents: 0,
          totalPaidCents: amount + interest,
          periods: Math.round((amount + interest) / monthly),
          effectiveAprPercent: Number(row["Effective APR"]!.replace("%", "")),
        };
        // The figures are the scenario's own fixtures; inputs are a valid placeholder loan.
        const inputs = {
          loanType: "TERM_SBA",
          principal: amount / 100,
          aprPercent: summary.effectiveAprPercent,
          term: { value: summary.periods, unit: "months" },
          frequency: "monthly",
          startDate: "2026-01-15",
        };
        const { rows: inserted } = await client.query<{ id: string }>(
          `INSERT INTO saved_calculations (title, loan_type, inputs, summary_results)
           VALUES ($1, 'TERM_SBA', $2, $3) RETURNING id`,
          [storedTitle, inputs, summary],
        );
        ids.push(inserted[0]!.id);
        seeded.push({ title: row.Title!, storedTitle, monthlyCents: monthly, interestCents: interest });
      }
    } finally {
      await client.end();
    }
    ctx.createdIds = ids;
    ctx.seeded = seeded;

    await page.goto("/");
    await page.evaluate(() => Object.assign(window, { __spaSession: true }));
    for (const { storedTitle } of seeded) {
      await expect(page.getByRole("checkbox", { name: storedTitle })).toBeVisible();
    }
  },
);

When(
  "the user selects all {int} scenarios and opens the {string}",
  async ({ page, ctx }, count: number, dialogName: string) => {
    const seeded = ctx.seeded as Seeded[];
    expect(seeded).toHaveLength(count);
    for (const { storedTitle } of seeded) {
      await page.getByRole("checkbox", { name: storedTitle }).check();
    }
    await page.getByRole("button", { name: new RegExp(dialogName) }).click();
  },
);

Then("the UI renders a multi-column modal without reloading the page", async ({ page, ctx, spa }) => {
  const dialog = page.getByRole("dialog", { name: "Comparison Matrix" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const titles = (ctx.seeded as Seeded[]).map((s) => s.storedTitle);
  await expect(dialog.getByRole("columnheader")).toHaveText(["Metric", ...titles]);
  expect(spa.navigations).toBe(1);
  expect(await page.evaluate(() => "__spaSession" in window)).toBe(true);
});

/** The matrix cell for a metric row and the seeded option with the lowest value. */
function winningCell(page: import("@playwright/test").Page, metric: string, values: number[]): Locator {
  const column = values.indexOf(Math.min(...values));
  return page
    .getByRole("dialog", { name: "Comparison Matrix" })
    .getByRole("row", { name: new RegExp(`^${metric}`) })
    .getByRole("cell")
    .nth(column);
}

Then("highlights the lowest total interest option in green", async ({ page, ctx }) => {
  // Seeded fees are 0, so the lowest interest is also the lowest interest & fees.
  const cell = winningCell(page, "Total interest & fees", (ctx.seeded as Seeded[]).map((s) => s.interestCents));
  await expect(cell).toHaveAttribute("data-highlight", "lowest-cost");
  await expect(cell).toContainText("Lowest cost");
  const [r, g, b] = await rgb(cell);
  expect(g).toBeGreaterThan(r);
  expect(g).toBeGreaterThan(b);
  await expect(page.locator('[data-highlight="lowest-cost"]')).toHaveCount(1);
});

Then("highlights the lowest monthly payment option in blue", async ({ page, ctx }) => {
  const cell = winningCell(page, "Monthly payment", (ctx.seeded as Seeded[]).map((s) => s.monthlyCents));
  await expect(cell).toHaveAttribute("data-highlight", "lowest-payment");
  await expect(cell).toContainText("Lowest payment");
  const [r, g, b] = await rgb(cell);
  expect(b).toBeGreaterThan(r);
  expect(b).toBeGreaterThan(g);
  await expect(page.locator('[data-highlight="lowest-payment"]')).toHaveCount(1);
});

// Scenario: export loan schedule summary to CSV (REQ-FUNC-DB03)
Given("an active calculated loan schedule with {int} periods", async ({ page }, periods: number) => {
  await page.goto("/");
  await waitForResult(page);
  await fill(page, "Term", periods);
  await page.getByLabel("Term unit", { exact: true }).selectOption("months");
  await expect(page.getByRole("status")).toContainText(`of ${periods}`);
});

When("the user clicks the {string} button", async ({ page, ctx }, name: string) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  ctx.download = await download;
  ctx.requests = requests;
});

Then("a file named {string} is generated client-side", async ({ ctx }, filename: string) => {
  const download = ctx.download as Download;
  expect(download.suggestedFilename()).toBe(filename);
  // Built in the browser: a blob: URL, and no request reached the server.
  expect(download.url()).toMatch(/^blob:/);
  expect((ctx.requests as string[]).filter((url) => !url.startsWith("blob:"))).toEqual([]);
});

Then("the header row contains {string}", async ({ ctx }, header: string) => {
  const download = ctx.download as Download;
  const text = await readFile(await download.path(), "utf8");
  const lines = text.split("\r\n");
  expect(lines[0]).toBe(header);
  // Header + one line per period (+ trailing newline).
  expect(lines.filter((line) => line !== "")).toHaveLength(37);
});
