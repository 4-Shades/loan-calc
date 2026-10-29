# LoanCalc-SPA

Multi-type loan & amortization engine: a single-page Next.js app backed by PostgreSQL.

| Document | Purpose |
| :--- | :--- |
| [docs/software_requirements_specification.md](docs/software_requirements_specification.md) | Requirements (SRS v1.1.0) |
| [docs/gherkin_bdd_feature_specs.md](docs/gherkin_bdd_feature_specs.md) | BDD scenarios; executable copies live in [features/](features/) |
| [docs/tdd_design.md](docs/tdd_design.md) | Test strategy and traceability |
| [implementation_plan.md](implementation_plan.md) | Slice-by-slice delivery plan |

## Requirements

- Node.js 24+
- Docker (PostgreSQL, integration tests, and the containerized app)

## Run with Docker

```bash
cp .env.example .env      # set POSTGRES_PASSWORD (and DATABASE_URL to match)
docker compose up --build # PostgreSQL → migrations → app on http://localhost:3000
```

The `migrate` service applies `db/migrations` and exits before the app starts. Data lives in the `pgdata` volume. If another PostgreSQL already uses port 5432 on your machine, set `POSTGRES_PORT` (e.g. 55432) in `.env` and use that port in `DATABASE_URL`.

## Deploy to Vercel

Vercel is a second deployment target next to Docker Compose. The same code runs on both; only configuration differs.

**One-time setup** (in the Vercel dashboard):

1. Import the GitHub repository as a Vercel project (framework preset: Next.js; Node.js 24).
2. Add **Neon** from the Vercel Marketplace (or connect an existing Neon project) for **Production**. The integration injects:
   - `DATABASE_URL`: the **pooled** connection (host contains `-pooler`), used by the app;
   - `DATABASE_URL_UNPOOLED`: the **direct** connection, used only for migrations. `DIRECT_URL` works too if you set the variables yourself.
3. In the Neon integration settings, enable **Create database branch for deployment** for **Preview**. Each preview deployment then gets its own branch (`preview/<git-branch>`, copied from production) with its own connection strings, so previews never touch production data or each other. Neon deletes a preview branch when Vercel removes the deployment, which by default can be months later; delete stale branches in the Neon console if you hit branch limits.
4. Add **Upstash Redis** from the Marketplace for Production and Preview. It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`; `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` also work. Rate limits are then shared by every function instance.
5. Pick a function region close to the database region.
6. For the preview checks in GitHub Actions:
   - In Deployment Protection, create a **Protection Bypass for Automation** secret, and add it to the GitHub repository secrets as `VERCEL_AUTOMATION_BYPASS_SECRET`.
   - Optionally, add the preview database's URL as `PREVIEW_DATABASE_URL`, so the `@db-direct` scenarios run too.

**What happens on deploy:** Vercel runs `npm run vercel-build`, which does three things:

1. It stops with a list of anything missing among the variables above.
2. It runs the SQL migrations (`npm run db:migrate`) against the direct URL, which is that deployment's own database: the production branch, or the preview's branch. It refuses a pooled (`-pooler`) host.
3. It builds the app.

Write migrations expand-then-contract, so that the deployment still serving traffic keeps working while a new one migrates.

**After a preview deploys:** `.github/workflows/preview.yml` runs the E2E suite and the Lighthouse budget against the preview URL. The rate-limit scenario runs on its own at the end, because Vercel gives every request from the CI runner the same client IP.

## Develop locally

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:up             # PostgreSQL from docker compose + migrations
npm run dev               # http://localhost:3000
```

## Database

There is no ORM. `src/lib/calculationsRepo.ts` holds every query as parameterized SQL over a shared `pg` pool (`src/lib/db.ts`); values are always bind parameters, never string-built.

Schema changes are plain SQL files in `db/migrations`, named `NNNN_description.sql` and applied in order by `npm run db:migrate`:

- Each file runs in its own transaction; a failure rolls that file back and stops the run.
- Applied files are recorded in the `schema_migrations` table; a PostgreSQL advisory lock keeps two deploys from migrating at once.
- Never edit a migration that has run anywhere; add a new file instead, written expand-then-contract so the running version keeps working.
- A database first set up by Prisma Migrate (before Prisma was removed) has `0001_init` recorded as applied, without re-running it.

## API

| Method | Path | Notes |
| :--- | :--- | :--- |
| `POST` | `/api/calculations` | Body `{ title, input }` (JSON, ≤ 32 KB). Results are recomputed on the server. `201 { id, title, loanType, createdAt }`; `400` validation details, `413`, `415`, `422` when the input can't be calculated, `429` after 60 saves/minute per IP (`Retry-After`), `403` cross-origin. |
| `GET` | `/api/calculations?limit=20&offset=0` | Newest first; summaries without full inputs. |
| `GET` | `/api/calculations/:id` | Full inputs and summary; `404` / `400` for unknown / malformed ids. |
| `GET` | `/api/health` | `200` when the database is reachable, else `503`. |

Errors are always JSON: `{ "error": "...", "details"?: [{ "path", "message" }] }`.

Every response carries security headers (Content-Security-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`). The CSP allows inline scripts because Next.js needs them for statically prerendered pages; everything else is limited to this origin.

Rate limiting is in memory, per process, on Docker. On Vercel the counts live in Upstash Redis and are shared by all function instances; Vercel's edge sets the client IP itself, so it can't be spoofed there. The client IP comes from `x-forwarded-for`, which clients can set themselves unless a reverse proxy overwrites it, so put the app behind one in production; a global cap of 600 saves/minute applies regardless.

## Scripts

| Script | What it does |
| :--- | :--- |
| `npm run verify` | Typecheck, lint, unit + component tests |
| `npm test` | Unit + component tests (no Docker needed) |
| `npm run test:watch` | Unit + component tests in watch mode |
| `npm run test:unit` / `test:component` | One Vitest project |
| `npm run test:coverage` | Unit + component tests with coverage gates (engine 90%, overall 80%) |
| `npm run test:integration` | API route handlers against PostgreSQL 16, and the rate-limit contract against Redis 7, in Testcontainers (needs Docker) |
| `npm run test:perf` | Engine performance budgets (REQ-NFR-PERF1), run on their own |
| `npm run vercel-build` | What Vercel runs: env check, SQL migrations (via `DATABASE_URL_UNPOOLED` / `DIRECT_URL`), build. Not for local use |
| `npm run test:e2e` | Playwright against a fresh production build on port 3100: BDD scenarios from `features/*.feature` plus responsive, accessibility (axe, WCAG 2.1 AA) and security specs (needs `DATABASE_URL`, e.g. `npm run db:up`) |
| `npm run test:compose` | Systems test: builds and runs the full Compose stack as a throwaway project (REQ-INT-002) |
| `npm run test:lighthouse` | Lighthouse desktop preset, median of 3 runs; fails if First Contentful Paint ≥ 1.2 s (REQ-NFR-PERF2). Needs Chrome, or set `CHROME_PATH` (e.g. to Edge) |
| `npm run db:up` | Start PostgreSQL from Docker Compose and apply migrations |
| `npm run db:migrate` | Apply pending `db/migrations/*.sql` (uses the direct URL; loads `.env` locally) |

## Test layout

```
features/            Gherkin acceptance specs (source of truth for behavior)
tests/unit/          Pure engine, schema and utility tests (node)
tests/component/     React Testing Library tests (jsdom)
tests/integration/   API + PostgreSQL tests (Testcontainers)
tests/perf/          Timing budgets
tests/e2e/steps/     Playwright-BDD step definitions
tests/e2e/specs/     Responsive, accessibility and security checks
scripts/             Compose systems test, Lighthouse budget
```

Scenarios without step definitions are skipped, not failed. Each slice adds steps for the scenarios it delivers.
