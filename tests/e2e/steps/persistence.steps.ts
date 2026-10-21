import { expect, type APIResponse, type Request, type Response } from "@playwright/test";
import { Client } from "pg";
import { Given, Then, When, results, waitForResult } from "./fixtures";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

// Scenario: successfully save a loan calculation scenario to PostgreSQL (REQ-FUNC-DB01, REQ-NFR-CODE2)
Given("a fully calculated loan schedule for {string}", async ({ page, ctx }, description: string) => {
  // The description ("SBA 7(a) Expansion Loan") names the offer; it is modeled as a Term / SBA loan.
  ctx.description = description;
  await page.goto("/");
  await page.getByRole("radio", { name: "Business Loan" }).click();
  await page.getByLabel("Loan type", { exact: true }).selectOption({ label: "Term / SBA Loan" });
  await waitForResult(page);
  await expect(page.getByRole("table", { name: "Amortization schedule" })).toBeVisible();
});

Given("valid payload parameters structured according to the Zod validation schema", async ({ page }) => {
  // The form validates against the same Zod schema the API uses; no field may be flagged.
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  await waitForResult(page);
});

When(
  "the user submits the {string} form with title {string}",
  async ({ page, ctx }, button: string, title: string) => {
    await page.getByLabel("Calculation title", { exact: true }).fill(title);
    const requestPromise = page.waitForRequest((r) => r.url().endsWith("/api/calculations") && r.method() === "POST");
    const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/calculations") && r.request().method() === "POST");
    await page.getByRole("button", { name: button }).click();
    ctx.request = await requestPromise;
    ctx.response = await responsePromise;
    ctx.title = title;
  },
);

Then("Next.js issues a Server Action \\/ REST POST request to {string}", async ({ ctx }, path: string) => {
  const request = ctx.request as Request;
  expect(new URL(request.url()).pathname).toBe(path);
  expect(request.method()).toBe("POST");
  expect(request.headers()["content-type"]).toBe("application/json");
  expect(request.postDataJSON()).toMatchObject({ title: ctx.title, input: { loanType: "TERM_SBA" } });
  expect((ctx.response as Response).status()).toBe(201);
});

Then("a JSON record is saved into the {string} PostgreSQL table", async ({ ctx }, table: string) => {
  // The table name comes from the feature file; only the known table is ever queried.
  expect(table).toBe("saved_calculations");
  const { id } = await (ctx.response as Response).json();
  ctx.id = id;
  const rows = await query<{ title: string; loan_type: string; inputs: { loanType: string }; summary_results: object }>(
    "SELECT title, loan_type, inputs, summary_results FROM saved_calculations WHERE id = $1",
    [id],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ title: ctx.title, loan_type: "TERM_SBA", inputs: { loanType: "TERM_SBA" } });
  expect(rows[0]!.summary_results).toMatchObject({ category: "BUSINESS", loanAmountCents: 10_000_000 });
});

Then("the UI displays a success notification with the assigned UUID", async ({ page, ctx }) => {
  const notification = results(page).getByRole("status");
  await expect(notification).toContainText(`Saved “${ctx.title as string}”`);
  await expect(notification).toContainText(ctx.id as string);
  expect((await notification.textContent()) ?? "").toMatch(UUID);
});

// Scenario: API rate limiting protection on persistence endpoints (REQ-NFR-SEC2)
Given("a client client IP address triggering continuous save requests", async ({ ctx }) => {
  // A documentation-range address unique to this run, so other scenarios' saves don't count.
  ctx.ip = `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
});

When(
  "the client sends more than {int} POST requests to {string} within {int} minute",
  async ({ request, ctx }, limit: number, path: string, minutes: number) => {
    const body = {
      title: "Rate limit probe",
      input: {
        loanType: "FIXED_INSTALLMENT",
        principal: 1_000,
        aprPercent: 5,
        term: { value: 12, unit: "months" },
        frequency: "monthly",
        startDate: "2026-01-15",
      },
    };
    const statuses: number[] = [];
    let last: APIResponse | undefined;
    const started = Date.now();
    for (let i = 0; i <= limit; i++) {
      last = await request.post(path, { data: body, headers: { "x-forwarded-for": ctx.ip as string } });
      statuses.push(last.status());
    }
    // The burst must fit inside the window the limit is measured over.
    expect(Date.now() - started).toBeLessThan(minutes * 60_000);
    ctx.statuses = statuses;
    ctx.last = last;
    ctx.lastBody = await last!.json();
    ctx.lastContentType = last!.headers()["content-type"];
  },
);

Then("the server returns an HTTP {int} Too Many Requests response status", async ({ ctx }, status: number) => {
  const statuses = ctx.statuses as number[];
  expect(statuses.slice(0, -1).every((s) => s === 201)).toBe(true);
  expect(statuses.at(-1)).toBe(status);
  expect((ctx.last as APIResponse).headers()["retry-after"]).toMatch(/^\d+$/);
});

Then("an error message indicating rate limit exceeded is returned in JSON format", async ({ ctx }) => {
  expect(ctx.lastContentType).toMatch(/^application\/json/);
  expect(ctx.lastBody).toEqual({ error: expect.stringMatching(/rate limit exceeded/i) });
});
