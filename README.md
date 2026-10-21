# LoanCalc-SPA

Multi-type loan & amortization engine: a single-page Next.js app backed by PostgreSQL.

| Document | Purpose |
| :--- | :--- |
| [software_requirements_specification.md](software_requirements_specification.md) | Requirements (SRS v1.0.0) |
| [gherkin_bdd_feature_specs.md](gherkin_bdd_feature_specs.md) | BDD scenarios; executable copies live in [features/](features/) |
| [tdd_design.md](tdd_design.md) | Test strategy and traceability |
| [implementation_plan.md](implementation_plan.md) | Slice-by-slice delivery plan |

## Requirements

- Node.js 24+
- Docker (PostgreSQL, integration tests, and the containerized app)

## Run with Docker

```bash
cp .env.example .env      # set POSTGRES_PASSWORD (and DATABASE_URL to match)
docker compose up --build # PostgreSQL → migrations → app on http://localhost:3000
```

The `migrate` service applies `prisma/migrations` and exits before the app starts. Data lives in the `pgdata` volume. If another PostgreSQL already uses port 5432 on your machine, set `POSTGRES_PORT` (e.g. 55432) in `.env` and use that port in `DATABASE_URL`.

## Develop locally

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:up             # PostgreSQL from docker compose + migrations
npm run dev               # http://localhost:3000
```

## API

| Method | Path | Notes |
| :--- | :--- | :--- |
| `POST` | `/api/calculations` | Body `{ title, input }` (JSON, ≤ 32 KB). Results are recomputed on the server. `201 { id, title, loanType, createdAt }`; `400` validation details, `413`, `415`, `422` when the input can't be calculated, `429` after 60 saves/minute per IP (`Retry-After`), `403` cross-origin. |
| `GET` | `/api/calculations?limit=20&offset=0` | Newest first; summaries without full inputs. |
| `GET` | `/api/calculations/:id` | Full inputs and summary; `404` / `400` for unknown / malformed ids. |
| `GET` | `/api/health` | `200` when the database is reachable, else `503`. |

Errors are always JSON: `{ "error": "...", "details"?: [{ "path", "message" }] }`.

Rate limiting is in memory, per process. The client IP comes from `x-forwarded-for`, which clients can set themselves unless a reverse proxy overwrites it, so put the app behind one in production; a global cap of 600 saves/minute applies regardless.

## Scripts

| Script | What it does |
| :--- | :--- |
| `npm run verify` | Prisma generate, typecheck, lint, unit + component tests |
| `npm test` | Unit + component tests (no Docker needed) |
| `npm run test:watch` | Unit + component tests in watch mode |
| `npm run test:unit` / `test:component` | One Vitest project |
| `npm run test:coverage` | Unit + component tests with coverage gates (engine 90%, overall 80%) |
| `npm run test:integration` | API route handlers against PostgreSQL 16 in Testcontainers (needs Docker) |
| `npm run test:perf` | Engine performance budgets (REQ-NFR-PERF1), run on their own |
| `npm run test:e2e` | Playwright-BDD from `features/*.feature` against a fresh production build on port 3100 (needs `DATABASE_URL`, e.g. `npm run db:up`) |
| `npm run test:compose` | Systems test: builds and runs the full Compose stack as a throwaway project (REQ-INT-002) |
| `npm run db:up` / `db:migrate` | Start PostgreSQL and apply migrations / apply migrations only |
| `npm run db:generate` / `db:validate` | Prisma client generation / schema validation |

## Test layout

```
features/            Gherkin acceptance specs (source of truth for behavior)
tests/unit/          Pure engine, schema and utility tests (node)
tests/component/     React Testing Library tests (jsdom)
tests/integration/   API + PostgreSQL tests (Testcontainers)
tests/perf/          Timing budgets
tests/e2e/steps/     Playwright-BDD step definitions
scripts/             Compose systems test
```

Scenarios without step definitions are skipped, not failed. Each slice adds steps for the scenarios it delivers.
