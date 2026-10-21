import { expect, test } from "@playwright/test";
import { Client } from "pg";

/** REQ-NFR-SEC1 / SEC2 hardening checks against the production build. */

test("pages send security headers and no X-Powered-By", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("API responses are JSON with nosniff and no CORS grant", async ({ request }) => {
  const response = await request.get("/api/calculations?limit=1", { headers: { origin: "https://evil.example" } });
  expect(response.headers()["content-type"]).toMatch(/^application\/json/);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
});

test("the app runs under its CSP without violations, including PDF and CSV export", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Results" }).locator("dl")).toBeVisible();

  for (const [button, filename] of [
    ["Export PDF", "loan-amortization-schedule.pdf"],
    ["Export CSV", "loan-amortization-schedule.csv"],
  ] as const) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: button }).click();
    expect((await download).suggestedFilename()).toBe(filename);
  }
  expect(violations).toEqual([]);
});

test("markup stored in the database is shown as text, never executed (XSS)", { tag: "@db-direct" }, async ({ page }) => {
  // Bypass API sanitization on purpose: React's escaping must hold even for bad data.
  const payload = `<img src=x onerror="window.__xss=1">Offer`;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids: string[] = [];
  try {
    for (const title of [payload, "Second offer"]) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO saved_calculations (title, loan_type, inputs, summary_results)
         VALUES ($1, 'FIXED_INSTALLMENT', $2, $3) RETURNING id`,
        [
          title,
          { loanType: "FIXED_INSTALLMENT", principal: 10000, aprPercent: 5, term: { value: 24, unit: "months" }, frequency: "monthly", startDate: "2026-01-15" },
          { category: "PERSONAL", loanAmountCents: 1_000_000, regularPaymentCents: 43_871, monthlyPaymentCents: 43_871, totalInterestCents: 52_915, totalFeesCents: 0, totalPaidCents: 1_052_915, periods: 24, effectiveAprPercent: null },
        ],
      );
      ids.push(rows[0]!.id);
    }

    await page.goto("/");
    const savedList = page.getByRole("region", { name: "Saved calculations" });
    await expect(savedList.getByText(payload, { exact: true })).toBeVisible();

    await page.getByRole("checkbox", { name: /window\.__xss/ }).check();
    await page.getByRole("checkbox", { name: /Second offer/ }).check();
    await page.getByRole("button", { name: /Comparison Matrix/ }).click();
    await expect(page.getByRole("dialog").getByRole("columnheader", { name: payload })).toBeVisible();

    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
    expect(await page.locator("main img").count()).toBe(0);
  } finally {
    await db.query("DELETE FROM saved_calculations WHERE id = ANY($1::uuid[])", [ids]);
    await db.end();
  }
});
