import { expect } from "@playwright/test";
import {
  COLUMN,
  Given,
  Then,
  When,
  fill,
  formatUsd,
  parseMoney,
  scheduleRow,
  summaryNumber,
  summaryValue,
  waitForResult,
} from "./fixtures";

// Scenario Outline: standard fixed-rate personal installment loan
Given("the user inputs a loan principal of ${int}", async ({ page }, principal: number) => {
  await fill(page, "Loan amount", principal);
});

Given("an Annual Percentage Rate \\(APR) of {float}%", async ({ page }, apr: number) => {
  await fill(page, "APR (%)", apr);
});

Given("a loan term of {int} months", async ({ page }, months: number) => {
  await fill(page, "Term", months);
  await page.getByLabel("Term unit", { exact: true }).selectOption("months");
});

Given("a payment frequency of {string}", async ({ page }, frequency: string) => {
  await page.getByLabel("Payment frequency", { exact: true }).selectOption({ label: frequency });
});

When("the system executes the calculation engine", async ({ page }) => {
  await waitForResult(page);
});

// "Approximately" is to the cent: the Examples table was corrected to exact schedule totals (D8).
Then("the calculated periodic payment should be approximately ${float}", async ({ page }, payment: number) => {
  await expect(summaryValue(page, "Regular payment")).toHaveText(formatUsd(payment));
});

Then(
  "the total interest paid over the life of the loan should be approximately ${float}",
  async ({ page }, interest: number) => {
    await expect(summaryValue(page, "Total interest")).toHaveText(formatUsd(interest));
  },
);

Then("the amortization schedule should contain exactly {int} payment periods", async ({ page }, periods: number) => {
  await expect(summaryValue(page, "Number of payments")).toHaveText(String(periods));
  await expect(page.getByRole("status")).toContainText(`of ${periods}`);
});

// Scenario: acceleration of loan payoff via recurring extra payments
Given(
  /^a fixed personal loan with principal \$([\d,]+), APR ([\d.]+)%, and (\d+) months term$/,
  async ({ page }, principal: string, apr: string, months: string) => {
    await fill(page, "Loan amount", parseMoney(principal));
    await fill(page, "APR (%)", apr);
    await fill(page, "Term", months);
    await waitForResult(page);
    await expect(page.getByRole("status")).toContainText(`of ${months}`);
  },
);

When("the user adds a recurring extra payment of ${float} per month", async ({ page }, extra: number) => {
  await fill(page, "Extra payment per period", extra);
  await waitForResult(page);
});

Then("the engine calculates a term reduction of at least {int} months", async ({ page }, months: number) => {
  await expect(summaryValue(page, "Payments saved")).toBeVisible();
  expect(await summaryNumber(page, "Payments saved")).toBeGreaterThanOrEqual(months);
});

Then(/^the computed total interest savings should exceed \$([\d,.]+)$/, async ({ page }, amount: string) => {
  expect(await summaryNumber(page, "Interest saved")).toBeGreaterThan(parseMoney(amount));
});

Then("the interactive amortization schedule updates instantly without page reload", async ({ page, spa }) => {
  const payments = await summaryNumber(page, "Number of payments");
  await expect(page.getByRole("status")).toContainText(`of ${payments}`);
  expect(spa.navigations).toBe(1);
  expect(await page.evaluate(() => "__spaSession" in window)).toBe(true);
});

// Scenario: revolving line of credit minimum payment calculation
Given(/^inputs an outstanding balance of \$([\d,.]+)$/, async ({ page }, balance: string) => {
  await fill(page, "Outstanding balance", parseMoney(balance));
});

Given("an APR of {float}%", async ({ page }, apr: number) => {
  await fill(page, "APR (%)", apr);
});

Given("a minimum payment rule of {float}% of outstanding balance", async ({ page }, percent: number) => {
  await fill(page, "Minimum payment (% of balance)", percent);
});

When("the calculation engine executes", async ({ page }) => {
  await waitForResult(page);
});

Then(/^the initial monthly minimum payment should be calculated as \$([\d,.]+)$/, async ({ page }, amount: string) => {
  await expect(summaryValue(page, "Initial minimum payment")).toHaveText(formatUsd(parseMoney(amount)));
});

Then(
  /^the breakdown should reflect \$([\d,.]+) toward interest and \$([\d,.]+) toward principal reduction$/,
  async ({ page }, interest: string, principal: string) => {
    const cells = scheduleRow(page, 1);
    await expect(cells.nth(COLUMN.interest)).toHaveText(formatUsd(parseMoney(interest)));
    await expect(cells.nth(COLUMN.principal)).toHaveText(formatUsd(parseMoney(principal)));
  },
);
