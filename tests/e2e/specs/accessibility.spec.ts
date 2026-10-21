import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Automated WCAG 2.1 A/AA checks with axe-core, in the states users actually see. */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const SAVED = {
  items: [
    {
      id: "6f1c2a0e-1111-4c4c-8888-000000000001",
      title: "Bank Term Loan",
      loanType: "TERM_SBA",
      createdAt: "2026-10-21T08:00:00.000Z",
      summary: {
        category: "BUSINESS",
        loanAmountCents: 10_000_000,
        regularPaymentCents: 309_664,
        monthlyPaymentCents: 309_664,
        totalInterestCents: 1_147_904,
        totalFeesCents: 0,
        totalPaidCents: 11_147_904,
        periods: 36,
        effectiveAprPercent: 7.2,
      },
    },
    {
      id: "6f1c2a0e-1111-4c4c-8888-000000000002",
      title: "Equipment Lease",
      loanType: "EQUIPMENT",
      createdAt: "2026-10-21T08:00:00.000Z",
      summary: {
        category: "BUSINESS",
        loanAmountCents: 10_000_000,
        regularPaymentCents: 235_367,
        monthlyPaymentCents: 235_367,
        totalInterestCents: 1_297_616,
        totalFeesCents: 0,
        totalPaidCents: 11_297_616,
        periods: 48,
        effectiveAprPercent: 6.1,
      },
    },
  ],
  limit: 20,
  offset: 0,
};

async function open(page: Page) {
  await page.route("**/api/calculations?*", (route) => route.fulfill({ json: SAVED }));
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Results" }).locator("dl")).toBeVisible();
}

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test("calculator, charts, schedule and saved list", async ({ page }) => {
      await open(page);
      await expectNoViolations(page);
    });

    test("business loan with fees", async ({ page }) => {
      await open(page);
      await page.getByRole("radio", { name: "Business Loan" }).click();
      await page.getByLabel("Loan type", { exact: true }).selectOption({ label: "Merchant Cash Advance" });
      await expectNoViolations(page);
    });

    test("validation errors and an alert", async ({ page }) => {
      await open(page);
      await page.getByLabel("Loan amount", { exact: true }).fill("50");
      await expect(page.getByLabel("Loan amount", { exact: true })).toHaveAttribute("aria-invalid", "true");
      await expectNoViolations(page);

      await page.getByLabel("Loan amount", { exact: true }).fill("100000");
      await page.getByLabel("APR (%)", { exact: true }).fill("50");
      await page.getByLabel("Term", { exact: true }).fill("30");
      await page.getByLabel("Term unit", { exact: true }).selectOption("years");
      await expect(page.getByRole("region", { name: "Results" }).getByRole("alert")).toBeVisible();
      await expectNoViolations(page);
    });

    test("comparison matrix dialog", async ({ page }) => {
      await open(page);
      await page.getByRole("checkbox", { name: /Bank Term Loan/ }).check();
      await page.getByRole("checkbox", { name: /Equipment Lease/ }).check();
      await page.getByRole("button", { name: /Comparison Matrix/ }).click();
      await expect(page.getByRole("dialog", { name: "Comparison Matrix" })).toBeVisible();
      await expectNoViolations(page);
    });
  });
}

test("keyboard: every control is reachable and the APR slider responds to arrow keys", async ({ page }) => {
  await open(page);
  const reached = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("aria-label") ?? (el?.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null) ?? el?.textContent ?? "";
    });
    reached.add(name.trim());
  }
  for (const control of ["Personal Loan", "Loan type", "Loan amount", "APR (%)", "APR (%) slider", "Term", "Payment frequency"]) {
    expect([...reached]).toContain(control);
  }

  const slider = page.getByRole("slider", { name: "APR (%) slider" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("5.01");
  await expect(page.getByLabel("APR (%)", { exact: true })).toHaveValue("5.01");
});
