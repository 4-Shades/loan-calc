import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { loanInputSchema } from "@/schemas/loanInput";

/**
 * REQ-FUNC-DB01, REQ-NFR-CODE2, REQ-NFR-SEC1, REQ-NFR-SEC2: the real route
 * handlers against a real PostgreSQL 16 with the committed migration applied.
 */

let container: StartedPostgreSqlContainer;
let sql: Client;
let routes: typeof import("@/app/api/calculations/route");
let itemRoute: typeof import("@/app/api/calculations/[id]/route");
let db: typeof import("@/lib/db");

const MIGRATION = "prisma/migrations/20261021000000_init/migration.sql";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  sql = new Client({ connectionString: container.getConnectionUri() });
  await sql.connect();
  await sql.query(readFileSync(MIGRATION, "utf8"));
  // Import after DATABASE_URL is set: the Prisma client is created lazily from it.
  db = await import("@/lib/db");
  routes = await import("@/app/api/calculations/route");
  itemRoute = await import("@/app/api/calculations/[id]/route");
});

afterAll(async () => {
  await db?.disconnectPrisma();
  await sql?.end();
  await container?.stop();
});

beforeEach(async () => {
  await sql.query("TRUNCATE saved_calculations");
});

const termLoan = {
  loanType: "TERM_SBA",
  principal: 100_000,
  aprPercent: 7.5,
  term: { value: 10, unit: "years" },
  frequency: "monthly",
  startDate: "2026-01-15",
  fees: [{ label: "Origination", amount: { kind: "percent", value: 2 } }],
};

let ipCounter = 0;
/** Each test gets its own client IP so rate-limit state never leaks between tests. */
const freshIp = () => `198.51.100.${++ipCounter}`;

function post(body: unknown, { ip = freshIp(), headers = {} as Record<string, string> } = {}) {
  return routes.POST(
    new Request("http://localhost:3000/api/calculations", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const rowCount = async () => Number((await sql.query("SELECT count(*) FROM saved_calculations")).rows[0].count);

describe("POST /api/calculations (REQ-FUNC-DB01)", () => {
  it("saves the calculation and returns its id", async () => {
    const response = await post({ title: "Option A - Local Bank SBA", input: termLoan });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ title: "Option A - Local Bank SBA", loanType: "TERM_SBA" });
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(response.headers.get("location")).toBe(`/api/calculations/${body.id}`);

    const { rows } = await sql.query("SELECT * FROM saved_calculations WHERE id = $1", [body.id]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.title).toBe("Option A - Local Bank SBA");
    expect(row.loan_type).toBe("TERM_SBA");
    expect(row.inputs).toEqual(loanInputSchema.parse(termLoan));
    expect(row.summary_results).toMatchObject({
      category: "BUSINESS",
      loanAmountCents: 10_000_000,
      regularPaymentCents: 118_702,
      totalFeesCents: 200_000,
      periods: 120,
    });
    expect(row.summary_results.effectiveAprPercent).toBeGreaterThan(7.5);
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("computes the results on the server instead of trusting the client", async () => {
    const response = await post({ title: "Forged", input: termLoan, summary: { totalInterestCents: 0 } });
    expect(response.status).toBe(400);
    expect(await rowCount()).toBe(0);
  });

  it("rejects an invalid payload with field-level details (REQ-NFR-CODE2)", async () => {
    const response = await post({ title: "", input: { ...termLoan, principal: 50 } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid calculation",
      details: [
        { path: "title", message: "Enter a title" },
        { path: "input.principal", message: "Loan amount must be between $100 and $10,000,000" },
      ],
    });
    expect(await rowCount()).toBe(0);
  });

  it("explains inputs that cannot be calculated", async () => {
    const response = await post({
      title: "Too long",
      input: { ...termLoan, aprPercent: 50, term: { value: 30, unit: "years" }, fees: undefined },
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatch(/never reduces the balance/);
  });

  it("rejects malformed JSON", async () => {
    const response = await post("{ not json");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body must be valid JSON" });
  });

  it("requires a JSON content type (blocks simple cross-site form posts)", async () => {
    const response = await post({ title: "A", input: termLoan }, { headers: { "content-type": "text/plain" } });
    expect(response.status).toBe(415);
  });

  it("rejects cross-origin requests", async () => {
    const response = await post({ title: "A", input: termLoan }, { headers: { origin: "https://evil.example" } });
    expect(response.status).toBe(403);
    expect(await rowCount()).toBe(0);
  });

  it("accepts same-origin requests", async () => {
    const response = await post({ title: "A", input: termLoan }, { headers: { origin: "http://localhost:3000" } });
    expect(response.status).toBe(201);
  });

  it("rejects oversized bodies", async () => {
    const response = await post({ title: "A", input: termLoan, padding: "x".repeat(40_000) });
    expect(response.status).toBe(413);
  });
});

describe("input sanitization (REQ-NFR-SEC1)", () => {
  it("strips markup from the title before storing it", async () => {
    const response = await post({ title: "<script>alert(1)</script>Bank offer", input: termLoan });
    const { id } = await response.json();
    const { rows } = await sql.query("SELECT title FROM saved_calculations WHERE id = $1", [id]);
    expect(rows[0].title).toBe("alert(1)Bank offer");
  });

  it("stores SQL-looking titles literally (parameterized queries)", async () => {
    const title = "'; DROP TABLE saved_calculations;--";
    const { id } = await (await post({ title, input: termLoan })).json();
    const { rows } = await sql.query("SELECT title FROM saved_calculations WHERE id = $1", [id]);
    expect(rows[0].title).toBe(title);
    expect(await rowCount()).toBe(1);
  });
});

describe("rate limiting (REQ-NFR-SEC2)", () => {
  it("returns 429 with a JSON error after 60 POSTs a minute from one IP", async () => {
    const ip = freshIp();
    for (let i = 0; i < 60; i++) {
      expect((await post({ title: `Save ${i}`, input: termLoan }, { ip })).status).toBe(201);
    }
    const limited = await post({ title: "One too many", input: termLoan }, { ip });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await limited.json()).toEqual({ error: expect.stringMatching(/rate limit exceeded/i) });
    expect(await rowCount()).toBe(60);

    // Another client is unaffected.
    expect((await post({ title: "Other client", input: termLoan })).status).toBe(201);
  });
});

describe("GET /api/calculations", () => {
  async function seed(titles: string[]) {
    const ids: string[] = [];
    for (const title of titles) {
      ids.push((await (await post({ title, input: termLoan })).json()).id);
    }
    return ids;
  }

  const list = (query = "") => routes.GET(new Request(`http://localhost:3000/api/calculations${query}`));

  it("lists saved calculations newest first", async () => {
    await seed(["First", "Second", "Third"]);
    const response = await list();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.map((item: { title: string }) => item.title)).toEqual(["Third", "Second", "First"]);
    expect(body.items[0]).toMatchObject({ loanType: "TERM_SBA", summary: { category: "BUSINESS" } });
    expect(body.items[0]).not.toHaveProperty("inputs");
  });

  it("paginates with limit and offset", async () => {
    await seed(["A", "B", "C"]);
    const body = await (await list("?limit=2&offset=1")).json();
    expect(body).toMatchObject({ limit: 2, offset: 1 });
    expect(body.items.map((item: { title: string }) => item.title)).toEqual(["B", "A"]);
  });

  it.each(["?limit=0", "?limit=101", "?offset=-1", "?limit=abc"])("rejects %s", async (query) => {
    expect((await list(query)).status).toBe(400);
  });
});

describe("GET /api/calculations/:id", () => {
  const get = (id: string) =>
    itemRoute.GET(new Request(`http://localhost:3000/api/calculations/${id}`), { params: Promise.resolve({ id }) });

  it("returns the full saved calculation", async () => {
    const { id } = await (await post({ title: "Detail", input: termLoan })).json();
    const response = await get(id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id,
      title: "Detail",
      loanType: "TERM_SBA",
      inputs: loanInputSchema.parse(termLoan),
      summary: { regularPaymentCents: 118_702 },
    });
  });

  it("returns 404 for an unknown id and 400 for a malformed one", async () => {
    expect((await get("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(400);
  });
});

describe("connection pooling (REQ-INT-001)", () => {
  it("reuses one Prisma client (and its pool) across requests", () => {
    expect(db.getPrisma()).toBe(db.getPrisma());
  });
});
