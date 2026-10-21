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

// Scenario: Merchant Cash Advance factor rate and effective APR
Given(/^enters an advance amount of \$([\d,.]+)$/, async ({ page }, amount: string) => {
  await fill(page, "Advance amount", parseMoney(amount));
});

Given("inputs a Factor Rate of {float}", async ({ page }, factor: number) => {
  await fill(page, "Factor rate", factor);
});

Given("specifies a payback term of {int} months with daily automatic withholdings", async ({ page }, months: number) => {
  await page.getByLabel("Repayment", { exact: true }).selectOption("fixedTerm");
  await fill(page, "Term (months)", months);
  await page.getByLabel("Withholding frequency", { exact: true }).selectOption("daily");
});

When("the engine calculates the advance repayment terms", async ({ page }) => {
  await waitForResult(page);
});

Then(/^the total payback amount should equal \$([\d,.]+)$/, async ({ page }, amount: string) => {
  await expect(summaryValue(page, "Total payback")).toHaveText(formatUsd(parseMoney(amount)));
});

Then(/^the calculated total fee\/finance charge should equal \$([\d,.]+)$/, async ({ page }, amount: string) => {
  await expect(summaryValue(page, "Finance charge")).toHaveText(formatUsd(parseMoney(amount)));
});

Then(
  /^the calculated Effective APR should reflect the short-term annual cost exceeding ([\d.]+)%$/,
  async ({ page }, percent: string) => {
    expect(await summaryNumber(page, "Effective APR")).toBeGreaterThan(Number(percent));
  },
);

// Scenario: term loan with interest-only grace period
Given(/^enters a principal amount of \$([\d,.]+)$/, async ({ page }, amount: string) => {
  await fill(page, "Loan amount", parseMoney(amount));
});

Given("an interest rate of {float}% APR", async ({ page }, apr: number) => {
  await fill(page, "APR (%)", apr);
});

Given("a total loan term of {int} months", async ({ page }, months: number) => {
  await fill(page, "Term", months);
  await page.getByLabel("Term unit", { exact: true }).selectOption("months");
});

Given("a Grace Period duration of {int} months", async ({ page }, months: number) => {
  await fill(page, "Grace period (months)", months);
});

When("the amortization engine generates the payment schedule", async ({ page }) => {
  await waitForResult(page);
});

Then(/^payments for periods (\d+) through (\d+) should contain \$0 principal reduction$/, async ({ page }, from: string, to: string) => {
  for (let period = Number(from); period <= Number(to); period++) {
    await expect(scheduleRow(page, period).nth(COLUMN.principal)).toHaveText("$0.00");
  }
});

Then(
  /^payments for periods (\d+) through (\d+) should require \$([\d,.]+) monthly interest-only payments$/,
  async ({ page }, from: string, to: string, amount: string) => {
    for (let period = Number(from); period <= Number(to); period++) {
      const cells = scheduleRow(page, period);
      await expect(cells.nth(COLUMN.payment)).toHaveText(formatUsd(parseMoney(amount)));
      await expect(cells.nth(COLUMN.interest)).toHaveText(formatUsd(parseMoney(amount)));
    }
  },
);

Then(
  /^payments from period (\d+) onward should amortize the full \$([\d,.]+) principal over the remaining (\d+) months$/,
  async ({ page }, start: string, principal: string, remaining: string) => {
    const first = Number(start);
    // Still the full principal just before amortization starts, and principal falls from then on…
    await expect(scheduleRow(page, first - 1).nth(COLUMN.balance)).toHaveText(formatUsd(parseMoney(principal)));
    expect(parseMoney((await scheduleRow(page, first).nth(COLUMN.principal).textContent()) ?? "")).toBeGreaterThan(0);
    // …over exactly the remaining payments, ending at zero.
    const total = first - 1 + Number(remaining);
    await expect(summaryValue(page, "Number of payments")).toHaveText(String(total));
    await page.getByRole("button", { name: "Last page" }).click();
    await expect(scheduleRow(page, total).nth(COLUMN.balance)).toHaveText("$0.00");
  },
);

// Scenario: equipment financing with down payment and residual value
Given(/^specifies equipment purchase price of \$([\d,.]+)$/, async ({ page }, amount: string) => {
  await fill(page, "Purchase price", parseMoney(amount));
});

Given(/^a down payment of \$([\d,.]+) \((\d+)%\)$/, async ({ page }, amount: string, percent: string) => {
  await page.getByLabel("Down payment type", { exact: true }).selectOption("flat");
  await fill(page, "Down payment", parseMoney(amount));
  // The flat amount and the stated percentage must describe the same down payment.
  const price = parseMoney((await page.getByLabel("Purchase price", { exact: true }).inputValue()) ?? "");
  expect((parseMoney(amount) / price) * 100).toBeCloseTo(Number(percent), 6);
});

Given(/^a residual value at term end of \$([\d,.]+)$/, async ({ page }, amount: string) => {
  await fill(page, "Residual value", parseMoney(amount));
});

Given(/^an APR of ([\d.]+)% over (\d+) months$/, async ({ page }, apr: string, months: string) => {
  await fill(page, "APR (%)", apr);
  await fill(page, "Term", months);
  await page.getByLabel("Term unit", { exact: true }).selectOption("months");
});

When("the engine calculates the financing schedule", async ({ page }) => {
  await waitForResult(page);
});

Then(/^the financed principal base should equal \$([\d,.]+)$/, async ({ page }, amount: string) => {
  await expect(summaryValue(page, "Amount financed")).toHaveText(formatUsd(parseMoney(amount)));
});

Then(
  /^the final period balloon payment should account for the \$([\d,.]+) residual value$/,
  async ({ page }, residual: string) => {
    const balloon = await summaryNumber(page, "Final balloon payment");
    const regular = await summaryNumber(page, "Regular payment");
    // Balloon = regular payment + residual + at most a few cents of rounding.
    expect(balloon - regular).toBeGreaterThanOrEqual(parseMoney(residual));
    expect(balloon - regular).toBeLessThan(parseMoney(residual) + 1);
  },
);
