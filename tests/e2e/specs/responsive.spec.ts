import { expect, test, type Page } from "@playwright/test";

/** REQ-UI-002: mobile (320px+), tablet (768px+) and desktop (1024px+) layouts. */
const VIEWPORTS = [
  { name: "mobile", width: 320, height: 800, sideBySide: false },
  { name: "tablet", width: 768, height: 1000, sideBySide: false },
  { name: "desktop", width: 1024, height: 900, sideBySide: true },
] as const;

async function expectNoHorizontalPageScroll(page: Page) {
  const [scrollWidth, viewport] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(viewport);
}

/** Every visible input, select and button lies fully inside the viewport horizontally. */
async function expectControlsInsideViewport(page: Page, width: number) {
  const outside = await page.evaluate((viewportWidth) => {
    const controls = [...document.querySelectorAll<HTMLElement>("main input:not([type=checkbox]), main select, main button")];
    return controls
      .filter((el) => el.offsetParent !== null && !el.closest("[data-scrolls-horizontally]"))
      .map((el) => ({ label: el.getAttribute("aria-label") ?? el.id ?? el.textContent, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < -0.5 || rect.right > viewportWidth + 0.5)
      .map(({ label }) => label);
  }, width);
  expect(outside).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await page.route("**/api/calculations?*", (route) => route.fulfill({ json: { items: [], limit: 20, offset: 0 } }));
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Results" }).locator("dl")).toBeVisible();
    });

    test("fits the viewport with no horizontal page scroll", async ({ page }) => {
      await expectNoHorizontalPageScroll(page);
      await expectControlsInsideViewport(page, viewport.width);
    });

    test("keeps business-loan forms usable", async ({ page }) => {
      await page.getByRole("radio", { name: "Business Loan" }).click();
      for (const type of ["Term / SBA Loan", "Equipment Financing", "Merchant Cash Advance", "Interest-Only Grace Period Loan"]) {
        await page.getByLabel("Loan type", { exact: true }).selectOption({ label: type });
        await expectNoHorizontalPageScroll(page);
        await expectControlsInsideViewport(page, viewport.width);
      }
    });

    test(`puts results ${viewport.sideBySide ? "beside" : "below"} the form`, async ({ page }) => {
      const form = (await page.getByRole("radiogroup", { name: "Calculation mode" }).boundingBox())!;
      const results = (await page.getByRole("region", { name: "Results" }).boundingBox())!;
      if (viewport.sideBySide) {
        expect(results.x).toBeGreaterThan(form.x + form.width - 1);
      } else {
        expect(results.y).toBeGreaterThan(form.y);
        expect(Math.abs(results.x - form.x)).toBeLessThan(2);
      }
    });

    test("scrolls the schedule table inside its own box when it is wider than the screen", async ({ page }) => {
      const table = page.getByRole("table", { name: "Amortization schedule" });
      await expect(table).toBeVisible();
      const box = await table.evaluate((el) => {
        const container = el.parentElement!;
        return { container: container.getBoundingClientRect().width, overflow: getComputedStyle(container).overflowX };
      });
      expect(box.container).toBeLessThanOrEqual(viewport.width);
      expect(["auto", "scroll"]).toContain(box.overflow);
      await expectNoHorizontalPageScroll(page);
    });
  });
}
