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
- Docker (from Slice 6, for PostgreSQL)

## Getting started

```bash
npm install
cp .env.example .env
npm run db:generate
npm run dev        # http://localhost:3000
```

## Scripts

| Script | What it does |
| :--- | :--- |
| `npm run verify` | Prisma generate, typecheck, lint, unit + component tests (what CI runs) |
| `npm test` | All Vitest projects once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:unit` / `test:component` | One Vitest project |
| `npm run test:coverage` | Tests with coverage gates (engine 90%, overall 80%) |
| `npm run test:e2e` | Generate Playwright tests from `features/*.feature` and run them against a production build |
| `npm run db:generate` / `db:validate` | Prisma client generation / schema validation |

## Test layout

```
features/            Gherkin acceptance specs (source of truth for behavior)
tests/unit/          Pure engine, schema and utility tests (node)
tests/component/     React Testing Library tests (jsdom)
tests/integration/   API + PostgreSQL tests (Slice 6)
tests/e2e/steps/     Playwright-BDD step definitions
```

Scenarios without step definitions are skipped, not failed. Each slice adds steps for the scenarios it delivers.
