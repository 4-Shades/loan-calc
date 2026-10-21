import { expect } from "@playwright/test";
import { Given, waitForResult } from "./fixtures";

Given("the user is on the Loan Analytics SPA dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Marker that only survives if the page is never reloaded.
  await page.evaluate(() => Object.assign(window, { __spaSession: true }));
});

Given("the loan calculation panel is active", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => Object.assign(window, { __spaSession: true }));
  await waitForResult(page);
});

Given("the calculation mode is set to {string}", async ({ page }, mode: string) => {
  await page.getByRole("radio", { name: mode }).click();
  await expect(page.getByRole("radio", { name: mode })).toHaveAttribute("aria-checked", "true");
});

Given("the user selects loan type {string}", async ({ page }, label: string) => {
  await page.getByLabel("Loan type", { exact: true }).selectOption({ label });
});
