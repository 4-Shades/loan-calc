import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given } = createBdd();

Given("the user is on the Loan Analytics SPA dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
