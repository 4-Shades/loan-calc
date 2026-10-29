# Implementation Plan
## LoanCalc-SPA: Multi-Type Loan & Amortization Engine

**Inputs:** `docs/software_requirements_specification.md` (SRS v1.1.0), `docs/gherkin_bdd_feature_specs.md` (BDD), `docs/tdd_design.md` (TDD)

**SRS v1.1.0 (October 24, 2026)** replaced the ORM with the native `pg` driver (§1.3, REQ-INT-001), required parameterized SQL (REQ-NFR-SEC1), and changed Dockerfile Stage 2 to run SQL migration scripts (§3.5.2). This matches what was built when Prisma was removed (see "After Slice 9: Prisma removed"), so no code changes followed. Functional requirements are unchanged.
**Approach:** vertical slices, test-first. Each slice starts with failing tests from the TDD plan and ends with them green.

---

## 1. Decisions to Lock In First

These are defaults I would use. Items marked **Open** come from TDD §8 and need your call before the matching slice.

| # | Decision | Default | Status |
| :-- | :--- | :--- | :--- |
| D1 | Database access | **Native `pg`, no ORM** (Prisma removed after Slice 9). Parameterized SQL through the shared `pg` pool (`src/lib/calculationsRepo.ts`), plain SQL migrations in `db/migrations` applied by `src/lib/migrate.ts`. Now required by SRS v1.1.0 (§1.3, REQ-INT-001, REQ-NFR-SEC1) | Decided (per SRS v1.1.0) |
| D2 | Charts | Recharts (React-native, simple donut + area charts) | Proposed |
| D3 | Styling | Tailwind CSS v4, CSS-first (no config file), loaded through `@tailwindcss/turbopack`; native elements styled with utilities. shadcn/ui was not needed and not adopted | Decided |
| D4 | Money arithmetic | Integer cents internally; round half-up per period | Proposed |
| D5 | PDF export | `jspdf` + `jspdf-autotable`, client-side (SRS: "from SPA state") | Proposed |
| D6 | Rate limiter | In-memory sliding window keyed by IP for the single container; a shared store on Vercel (D16) | Decided |
| D7 | Engine location | Pure TS in `src/engine/`, imported by client and server | Per TDD |
| D8 | Total-interest values in BDD | Corrected to the cent-rounded schedule totals (529.15 / 5774.86 / 330.93); asserted exactly | Decided |
| D9 | Equipment residual | Balloon loan: level payments leaving the residual at term end, repaid with the final payment ($2,571.32 for the BDD case) | Decided |
| D10 | MCA Effective APR convention | Nominal (Reg Z style): periodic IRR × periods per year; daily = business days, 252/yr, 21/month (92.22% for the BDD case) | Decided |
| D11 | Revolving minimum | % of current balance each period, no floor | Decided |
| D12 | Fees on term/SBA loans | Deducted from proceeds: payments on the full amount, fees in a period-0 closing row, Effective APR on net proceeds. Applies to all business loan types | Decided |
| D13 | Auth | None. The SRS defines no users; saved calculations are global | Per SRS |
| D19 | Where migrations run (SRS §3.5.2) | §3.5.2 puts "run SQL migration scripts" in the builder stage, but no database is reachable during `docker build`. The `migrate` image target is built from the builder stage and runs `npm run db:migrate` when the Compose stack starts, before the app; on Vercel, `vercel-build` runs it. Interpreted as satisfying §3.5.2 | Decided |
| D14 | Hosting | Vercel for production and per-PR preview deployments. Docker Compose stays for self-hosting and REQ-INT-002 | Decided |
| D15 | Database on Vercel | **Neon** (serverless PostgreSQL, via the Vercel Marketplace integration), replacing Prisma Postgres. Through the existing `pg` pool and Prisma ORM: the **pooled** connection string (host contains `-pooler`) for the app (`DATABASE_URL`), the **direct/unpooled** one for migrations (`DIRECT_URL`, which the Neon integration also provides as `DATABASE_URL_UNPOOLED`), `sslmode=require`. Neon is only the host: the ORM stays Prisma (SRS §1.3 allows Prisma or Drizzle) | Decided (changed from Prisma Postgres) |
| D16 | Rate limiting on Vercel | **Upstash Redis** (Vercel Marketplace) behind a `RateLimiter` interface: an atomic Lua sliding window, same semantics as the in-memory store (which stays for Docker and tests). Fails open if Redis is down | Decided |
| D17 | Migrations on Vercel | `npm run db:migrate` (the SQL runner) inside `vercel-build`, against that deployment's own direct URL. Safe because every preview has its own Neon branch (D18); the build refuses to run without an explicit direct URL. Avoids fighting Vercel's automatic promotion | Decided |
| D18 | Preview databases | **A Neon branch per preview deployment** (`preview/<git-branch>`), created by the Neon–Vercel integration as a copy-on-write branch of production, with its connection strings injected into that deployment only. Neon deletes it when Vercel removes the deployment, which under Vercel's default retention can be months later. Previews never touch production data or each other. Replaces the shared preview database | Decided (changed) |

---

## 2. Target Architecture

```
src/
  engine/                 # pure TS, no framework imports
    money.ts  payment.ts  schedule.ts  extraPayments.ts  revolving.ts
    irr.ts    business/{term,equipment,mca,graceInterestOnly}.ts
    index.ts              # calculate(input) → { summary, schedule }
  schemas/                # Zod; shared by form + API
    personal.ts  business.ts  saveCalculation.ts  index.ts
  app/
    layout.tsx  page.tsx  # single page (REQ-UI-001)
    api/calculations/route.ts            # POST, GET list
    api/calculations/[id]/route.ts       # GET one
  components/
    ModeToggle  LoanForm  LoanTypeFields  AmortizationTable
    Charts  SummaryCards  SaveForm  SavedList  ComparisonMatrix  ExportButtons
  lib/
    csv.ts  pdf.ts  rateLimit.ts  sanitize.ts  db.ts  format.ts
  hooks/useCalculation.ts  # memoized engine call on input change
db/migrations/            # NNNN_name.sql, applied by src/lib/migrate.ts (Prisma was removed after Slice 9)
features/*.feature        # Gherkin, split per feature
tests/{unit,component,integration,e2e}/
Dockerfile  docker-compose.yml  .github/workflows/ci.yml
```

**Data flow:** form state → Zod parse → `calculate()` (client, sync) → `{summary, schedule}` → table, charts, summary cards. Saving posts `{title, loanType, inputs, summary}` to `/api/calculations`. The server re-validates with the same Zod schema and re-runs `calculate()` to confirm `summary_results` matches the inputs, so a client cannot store forged results.

### Styling (Tailwind CSS)

- **Setup:** Tailwind CSS v4, configured CSS-first. `src/app/globals.css` has `@import "tailwindcss"` and an `@theme inline` block for the background/foreground tokens and Geist fonts. There is no `tailwind.config` or PostCSS file; `next.config.ts` registers the `@tailwindcss/turbopack` loader for `*.css`. Unused utilities are dropped automatically at build time.
- **Conventions:**
  - Utility classes directly in components, with the zinc scale for neutrals.
  - Muted text is always `text-zinc-500 dark:text-zinc-400`; zinc-500 alone fails 4.5:1 contrast in dark mode (found by axe in Slice 8).
  - Red for field errors, amber for calculation alerts, green and blue only for comparison highlights, always paired with a text badge.
  - Class names stay complete static strings (no `bg-${color}-50` built at runtime), so Tailwind's source scan can find them.
- **Dark mode:** `dark:` variants follow the OS setting (Tailwind v4's default `prefers-color-scheme` strategy). There is no in-app theme toggle.
- **Layout:** mobile-first, using Tailwind's default breakpoints: `sm` 640 px, `md` 768 px, `lg` 1024 px. Form and results sit side by side from `lg`. The responsive E2E spec checks 320, 768 and 1024 px.
- **Charts are the exception:** their colors come from the validated palette in `src/components/results/chartTheme.ts`, as hex values. Recharts writes SVG attributes, where Tailwind classes and CSS variables aren't reliable.
- **Testing:** no class-name snapshots; tests assert behavior through roles and labels. Tailwind v4 colors are `oklch()`, so E2E checks that read computed colors convert them through a canvas first (see `tests/e2e/steps/comparison.steps.ts`). axe-core catches contrast regressions in both themes.

### Deployment targets

```
                ┌─ Vercel (D14): production on main, a preview per PR ─────────────┐
GitHub ─ push ──┤  Next.js build (no standalone output) → Functions + edge CDN     ├──► Neon PostgreSQL (D15)
                └──────────────────────────────────────────────────────────────────┘     pooled URL for the app,
                                                                                          direct URL for migrations (D17);
                                                                                          a branch per preview (D18)
Self-hosted ──── docker compose up --build: postgres → migrate → app (SRS §3.5, REQ-INT-002)
```

Both targets build the same code. Only configuration differs: output mode, database URLs, and the rate-limit store.

---

## 3. Slices

Each slice lists its tests first (Red), then the work (Green), then the exit check.

### Slice 0: Scaffold and tooling

- `create-next-app` (App Router, TypeScript, Tailwind), `strict: true`, `noUncheckedIndexedAccess`.
- Add Vitest, RTL, fast-check, Playwright (+ `playwright-bdd`), ESLint with `no-explicit-any: error`.
- Split the Gherkin file into `features/*.feature`, keeping tags.
- CI workflow: `tsc --noEmit`, lint, unit, component. Integration and E2E jobs are added in later slices.
- Copy the SRS section 3.3 SQL into `prisma/schema.prisma`: `LoanProduct`, `SavedCalculation` (JSONB as `Json`), and the `created_at DESC` index.

**Exit:** CI is green on an empty suite; `tsc` passes.

### Slice 1: Fixed-rate engine (PL01, PL02, AN01)

- **Red:** `payment.test.ts` (3 BDD rows + edge cases), `schedule.test.ts`, property tests (TDD §3.2, §3.3).
- **Green:** `money.ts`, `payment.ts` (`fixedPayment`), `schedule.ts` (rows: period, date, payment, principal, interest, fees, balance; last row absorbs rounding drift; period dates advance by frequency).
- Frequency support: weekly (52), bi-weekly (26), monthly (12), annual (1).
- **Exit:** the Scenario Outline numbers pass (per D8); property tests pass across 1,000+ random inputs.
- **Status:** done at unit level. The Scenario Outline's E2E steps wait for the UI (Slices 4–5). Non-amortizing inputs (e.g. 50% APR over 30 years) throw a `RangeError` that Slice 4 must surface as a validation message.

### Slice 2: Extra payments and revolving credit (PL03, PL01 #3)

- **Red:** `extraPayments.test.ts`, `revolving.test.ts`.
- **Green:** `buildSchedule` accepts `extraPayments: { recurringCents?, oneTime?: {period, amountCents}[] }`. Summary adds `extraPaymentImpact: { periodsSaved, interestSavedCents }`, computed against the same inputs with extras removed. `revolving.ts` per D11, with a hard cap on periods.
- Also add the **Interest-Only with Balloon** personal type (PL01 #2), which has no BDD scenario.
- **Exit:** the $20k/6%/48 scenario shows a 9-month reduction and about $498 saved.
- **Status:** done at unit level ($498.21 saved; $8,000 revolving line takes 943 months, $11,999.08 interest). Choices made:
  - Recurring extras are added once per payment period (identical to "monthly" for monthly loans; per week for weekly loans). Impact is reported in periods, not months.
  - Extra payments apply to fixed-rate installment loans only, not to interest-only or revolving.
  - Revolving: the minimum is a percentage of the balance before that month's interest (matches the BDD). Once the rounded minimum would reduce the balance by less than a cent (balances around $1), the remainder is paid off so the schedule ends. Default cap: 1,200 months, with `paidOff: false` if reached.

### Slice 3: Business engines (BL01–BL03)

- **Red:** `grace.test.ts`, `equipment.test.ts`, `irr.test.ts`, `mca.test.ts`, `term.test.ts`.
- **Green, in this order:**
  1. `graceInterestOnly.ts`: periods 1–6 pay $625.00, then amortize 30 periods.
  2. `equipment.ts`: financed = price − down payment; balloon per D9.
  3. `irr.ts`: bisection (always converges for conventional cash flows, so no Newton step needed), an iteration cap, and a clear error on non-convergence.
  4. `mca.ts`: payback = advance × factor; daily or weekly withholding; Effective APR via IRR per D10.
  5. `term.ts`: origination and SBA guarantee fees (flat or %), fees in the Fees column and in Effective APR.
- `engine/index.ts` dispatches on `loanType` with an exhaustive `switch` (compile error if a type is unhandled).
- **Exit:** all Business scenarios pass at unit level; MCA payback is $62,500.00 and Effective APR is above 45%.
- **Status:** done at unit level (MCA APR 92.22%; grace $625.00 × 6 then $3,665.97; equipment final payment $17,571.37). Changes and choices:
  - The `loanType` dispatcher moves to Slice 4, so it is built together with the Zod discriminated union that defines its inputs.
  - Business-day dates skip weekends only; public holidays are not modeled.
  - MCA withdrawals are split pro rata into principal and finance charge; the charge is shown in the Fees column (interest is 0). Balance is remaining advance, not remaining payback.
  - Revenue-share MCAs (BL02) are supported: withdrawal = holdback % × revenue per period, term derived. MCA terms are capped at 10 years.
  - SBA guarantee fees are entered as flat or % of the loan amount (real SBA fees are % of the guaranteed portion; enter the dollar amount for that).
  - Timing: 30-year monthly term loan with fees 1.4 ms; worst case (10-year daily MCA, 2,520 rows) 11 ms. Within the 50 ms budget; revisit in Slice 5.

### Slice 4: Validation and input UI (CODE2, UI-003, PL02, BL02)

- **Red:** schema tests (TDD §4); `ModeToggle`, `LoanForm` component tests.
- **Green:** Zod schemas as a discriminated union on `loanType`; `ModeToggle` swaps Personal / Business forms; type-specific fields (grace period only for Interest-Only, factor rate only for MCA); term in months or years; inline errors; sliders for APR and amount (with numeric inputs alongside, for accessibility).
- **Exit:** invalid input never reaches the engine; the form shows field-level messages.
- **Status:** done (unit + component tests; production build prerenders `/` as static). Choices made:
  - Loan type codes follow the SRS `type_code` style: `FIXED_INSTALLMENT`, `INTEREST_ONLY_BALLOON`, `REVOLVING`, `TERM_SBA`, `EQUIPMENT`, `MCA`, `GRACE_PERIOD`.
  - Ranges the SRS leaves open: business amounts $100–$10,000,000; terms up to 30 years; MCA terms up to 120 months.
  - Canonical input (`src/schemas/loanInput.ts`) is in dollars and months; `src/lib/calculateLoan.ts` converts to cents/periods and dispatches with an exhaustive `switch`.
  - Valid-but-impossible inputs (non-amortizing, revolving minimum below interest, fees ≥ loan, MCA too small/too slow) throw `LoanCalculationError` with a code; the dispatcher maps codes to readable messages shown in an alert.
  - Cross-field rules run only after every field is valid on its own, so each problem gets one message.
  - The form offers fixed fee slots (Origination, plus SBA guarantee on term loans) and one one-time extra payment; the schema accepts up to 5 fees and 12 one-time extras for API use.
  - Start date defaults to today via `useSyncExternalStore` (server snapshot null), because reading the clock during prerender fails with Cache Components.
  - A minimal results summary is included so the form is usable now; the table and charts are Slice 5.
  - E2E steps not yet written: Playwright browsers are not installed (`npx playwright install chromium`).

### Slice 5: Results UI and performance (AN01, AN02, UI-001, PERF1)

- **Red:** `AmortizationTable`, `Charts`, `SummaryCards` component tests; `engine.bench.ts` (360 periods under 5 ms); slider E2E with navigation counter.
- **Green:** `useCalculation` hook (`useMemo` on validated inputs; `useDeferredValue` if rendering needs it); table with pagination plus virtualization (e.g., `@tanstack/react-virtual`); stacked or area chart of cumulative principal vs interest; donut for payment breakdown; no `router.push` or form `action` navigation anywhere.
- Next.js: the calculator is a client component; the server component shell stays minimal to help FCP.
- **Exit:** the slider scenario passes, with p95 render under 50 ms on the CI profile.
- **Status:** done. All 9 calculator BDD scenarios pass in Chromium (persistence and rate-limit scenarios stay skipped until Slices 6–7). Slider: 250 recalculations, median 3.2 ms, p95 4.6 ms, max 8.2 ms (local, production build), so `useDeferredValue` was not needed. Notes:
  - Timing is recorded in the browser: `performance.mark` on each input, `performance.measure("loancalc:recalc")` in a layout effect when the new results commit. The E2E step asserts p95 from those entries.
  - Engine budgets run as their own Vitest project (`npm run test:perf`), not alongside the parallel property tests, so CPU contention doesn't skew them.
  - Chart colors are the first three slots of the dataviz reference palette, validated (`--pairs all`) against this app's white and #0a0a0a surfaces. Light aqua is 2.82:1 on white, so the balance chart has a text description and the table serves as its table view.
  - The donut follows the SRS (REQ-FUNC-AN02) although the dataviz guidance prefers a stacked bar; with no fees it has only two segments. Values and shares are printed in its legend.
  - Line-chart end labels were skipped: series ends collide on low-interest loans (interest and balance both near $0). Identity comes from the legend, tooltip and table.
  - Table: 12/24/60 rows per page, or "All" with TanStack Virtual (a 2,520-row MCA renders ~40 rows). The page stays put (clamped) when edits shorten the schedule.
  - CI now runs the perf budgets and a Playwright E2E job.

### Slice 6: Docker, database, and API (DB01, INT-001, INT-002, SEC1, SEC2)

- **Red:** Testcontainers integration tests (TDD §6, including §6.5 for the SQL migration runner); `rateLimit.test.ts`; `sanitize.test.ts`; `migrate.test.ts` (file loading); `compose.smoke.sh`.
- **Green:**
  - `docker-compose.yml` from the SRS (port 3000 / 5432, healthcheck, `depends_on: service_healthy`). Move the DB password to an `.env` file that is not committed; the SRS example hard-codes it.
  - Multi-stage `Dockerfile` (SRS §3.5.2): deps → builder (`next build` with `output: 'standalone'`) → runner with `USER node`. A `migrate` target built from the builder stage runs the SQL migration scripts (`npm run db:migrate`) as a one-shot Compose service before the app starts (D19).
  - SQL migrations: `db/migrations/NNNN_name.sql` applied in order by `src/lib/migrate.ts`, each file in its own transaction, recorded in `schema_migrations`, under a PostgreSQL advisory lock. A database created earlier by Prisma Migrate has `0001_init` recorded instead of re-run.
  - `lib/db.ts`: one native `pg` pool per process (REQ-INT-001; avoids connection storms in dev hot reload), verified TLS for remote hosts in production, idle-client errors logged instead of crashing.
  - `lib/calculationsRepo.ts`: insert, list, find and ping as SQL with bind parameters (`$1, $2, …`) only (REQ-NFR-SEC1).
  - `POST /api/calculations`: rate limit → body-size check → Zod parse → sanitize title → server-side recompute and compare → insert → `201 { id }`. Errors return JSON `{ error, details? }`; 429 includes `Retry-After`.
  - `GET /api/calculations` (newest first, paginated) and `GET /api/calculations/[id]`.
  - `SaveForm`: toast with the UUID on success.
- **Exit:** `docker compose up --build` works on a clean checkout; the Save scenario and the 429 scenario pass; data survives an app restart.
- **Updated for SRS v1.1.0:** first built on Prisma; rebuilt on the native `pg` pool and SQL migrations (see "After Slice 9: Prisma removed"). The status notes below that mention Prisma describe the first build.
- **Re-verified on the native `pg` stack (October 24, 2026):**
  - Integration: 31 passed against PostgreSQL 16 (21 API, 5 SQL migration runner, 5 Redis rate-limit contract).
  - `npm run db:up` on the existing local database: it had been created by Prisma Migrate; `0001_init` was already recorded in `schema_migrations` (adopted, not re-run, `_prisma_migrations` left in place); the run reported "Database is up to date".
  - E2E: all 38 passed, none skipped (Save, comparison and 429 included); slider p95 12.2 ms.
  - `npm run test:compose`: built from scratch, migrate service ran before the app, health check reached the database, the saved row survived an app restart, app runs as uid 1000.
- **Status (first build):** done. `npm run test:compose` builds the stack from scratch, saves, restarts the app, reads the row back and confirms uid 1000 (`node`); the Save and 429 BDD scenarios pass; 21 integration tests pass against PostgreSQL 16 in Testcontainers. Changes and choices:
  - The client sends only `{ title, input }`; the server recomputes and stores the summary (rather than recomputing and comparing), so stored results always follow from stored inputs. Extra keys are rejected.
  - Prisma 7 needs a driver adapter: `@prisma/adapter-pg` with a pooled `pg` connection; TLS is required for remote databases in production (`DATABASE_SSL` overrides).
  - Migrations run in a one-shot `migrate` Compose service (the builder stage), so the runner image stays minimal (216 MB). The migrator image is large (1.16 GB); slimming it is a later optimization.
  - The Compose host port for PostgreSQL defaults to 5432 but is configurable (`POSTGRES_PORT`) because a native PostgreSQL may already own 5432.
  - Rate limit: per-IP sliding window (60/min) plus a global cap (600/min), since `x-forwarded-for` can be spoofed without a reverse proxy. In memory, so per process.
  - API also enforces same-origin (403), JSON content type (415) and a 32 KB body limit (413). `GET /api/health` added for container health checks.
  - E2E runs on its own port (3100) and never reuses an existing server: it had silently reused a `next dev` server on 3000, whose dev-mode React made the slider look 10× slower.

### Slice 7: Comparison and export (DB02, DB03)

- **Red:** `ComparisonMatrix` tests; `csv.test.ts`; E2E for both.
- **Green:**
  - `SavedList` with checkboxes, capped at 3 selections.
  - `ComparisonMatrix` modal, no page reload; green highlight for lowest total interest, blue for lowest monthly payment; ties highlight all tied cells. Fetches the full records so total interest is available.
  - `csv.ts`: header exactly `Period,Date,Payment,Principal,Interest,Fees,Remaining Balance`; quote fields; guard against CSV formula injection (prefix `=`, `+`, `-`, `@` cells in text fields); download as `loan-amortization-schedule.csv` via a Blob.
  - `pdf.ts`: summary plus schedule table, built client-side.
- **Exit:** comparison and CSV scenarios pass; PDF smoke test checks that a non-empty file downloads.
- **Status:** done. All 13 BDD scenarios pass, none skipped. Changes and choices:
  - BDD change: the comparison scenario's table gained a **Total Interest** column (TDD §8 item 5). Values follow from each row's payment and a standard term (e.g. $3,096.64 × 36 − $100,000 = $11,479.04).
  - "Lowest total interest" is judged on **interest + fees** (an MCA's cost is all fees), and "monthly payment" is the regular payment converted to a monthly equivalent (daily MCA × 21, weekly × 52/12). Saved summaries now store `monthlyPaymentCents`; older rows fall back to the per-period payment.
  - Ties highlight every tied option. Highlights carry text badges ("Lowest cost", "Lowest payment") so they don't rely on color.
  - Columns follow selection order. The matrix needs 2–3 selections; the 4th checkbox is disabled.
  - CSV: amounts as plain decimals (no $ or commas), CRLF, period 0 for fee closing rows, formula-injection guard for text cells. PDF: jsPDF + autotable, loaded only when "Export PDF" is clicked.
  - E2E now leaves the database as it found it: the rate-limit probe sends invalid bodies (still counted, nothing written) and scenarios that insert rows delete them in an `After` hook.

### Slice 8: Hardening and release

- Responsive E2E at 320, 768 and 1024 px (UI-002).
- Lighthouse CI: FCP under 1.2 s on the production build (PERF2).
- Security pass: XSS payloads in the title (rendered as text, never `dangerouslySetInnerHTML`), SQLi strings, security headers via `next.config.js`, CORS limited to same origin.
- Accessibility pass: labels, keyboard slider control, chart text alternatives, contrast for the green and blue highlights (add icons or labels so meaning is not color-only).
- README: run, test and docker instructions. Final traceability check against TDD §2.

**Exit:** every row of the TDD traceability matrix has a passing test; CI runs unit, component, integration, E2E, Lighthouse and the compose smoke test.
- **Status:** done. Traceability matrix (TDD §2) updated with the real test files; every requirement has a passing check. Results:
  - Responsive (UI-002): no horizontal page scroll and all controls inside the viewport at 320, 768 and 1024 px, for every loan type; results sit beside the form from 1024 px, below it otherwise; the schedule table scrolls inside its own box.
  - Lighthouse (PERF2, desktop preset = 40 ms RTT / 10 Mbps): median FCP 227 ms, performance score 100 (budget < 1.2 s).
  - Accessibility: axe-core finds no WCAG 2.1 A/AA violations in light or dark mode across calculator, business forms, validation errors, alerts and the comparison dialog; every control is keyboard reachable. Fixed: muted text was 4.3:1 in dark mode (now zinc-400, about 8:1).
  - Security: CSP and hardening headers on every route, `X-Powered-By` removed, no CORS grant; the app runs under the CSP with no violations (including PDF/CSV export); markup inserted straight into the database renders as text; ESLint forbids `dangerouslySetInnerHTML`.
  - CSP uses Next's "without nonces" policy (`'unsafe-inline'` scripts): nonces would force dynamic rendering and are incompatible with partial prerendering. `upgrade-insecure-requests` and HSTS are left to the HTTPS reverse proxy.

### Slice 9: Vercel hosting (D14–D18)

SRS §3.5 requires deployment with Docker Compose, so Vercel is an *additional* target: the Compose path stays as it is, and its smoke test stays in CI.

- **Red:**
  - Config test: `output` is `"standalone"` except when `VERCEL` is set.
  - `dbConfig` tests with managed-Postgres URLs (pooler host, `sslmode=require`) give verified TLS. Pool size comes from `DATABASE_POOL_MAX`.
  - `clientIp` tests: on Vercel, trust the client IP its edge sets (`x-vercel-forwarded-for`, or `x-forwarded-for`, which Vercel overwrites). Elsewhere, behavior is unchanged.
  - Rate-limiter **contract tests** run against both stores: memory, and Redis via Testcontainers. Same 60/min per IP, same 429 with `Retry-After`, same global cap.
  - E2E: an `E2E_BASE_URL` mode that skips Playwright's `webServer` and targets a deployed preview. Scenarios that seed rows with direct SQL get a `@db-direct` tag and are skipped for remote runs, unless a preview `DATABASE_URL` secret is provided.
- **Green:**
  - `next.config.ts`: `output: process.env.VERCEL ? undefined : "standalone"`. Security headers already come from `next.config.ts`, so they apply on Vercel unchanged.
  - `RateLimiter` interface with an async `check`, plus `memory` and `redis` implementations chosen by environment variables (e.g. `RATE_LIMIT_STORE`, plus the store's URL and token). The API route awaits it.
  - `db.ts`: small pool per function instance (`DATABASE_POOL_MAX`, e.g. 3) on the pooled connection string. Idle clients are released when an instance suspends; Vercel provides a helper for this in `@vercel/functions` (check the current API when implementing).
  - Migrations use the direct URL when set (`DIRECT_URL ?? DATABASE_URL_UNPOOLED ?? DATABASE_URL`, `migrationUrl()` in `deployEnv.ts`); the app keeps using the pooled `DATABASE_URL`. The pooled Neon connection runs PgBouncer in transaction mode, so the app must not rely on session state (it doesn't).
  - Vercel project settings:
    - Next.js framework preset, Node 24.
    - Function region co-located with the database.
    - Environment variables per environment (Production, Preview, Development): `DATABASE_URL` (pooled), `DIRECT_URL` (or `DATABASE_URL_UNPOOLED`), rate-limit store credentials. With the Neon integration the database variables are injected per environment, and Preview deployments get their branch's strings. The local `.env` is never uploaded.
  - CI:
    - Vercel's Git integration builds a preview per PR and production from `main`.
    - Migrations run in `vercel-build`, per environment (D17): a preview migrates its own Neon branch, production migrates the main branch.
    - On a successful preview deployment, the E2E suite (BDD + specs) and the Lighthouse budget run against the preview URL. If Vercel Deployment Protection is on, they send Vercel's protection-bypass token for automation.
  - HTTPS: Vercel serves HTTPS and HSTS on its domains, which covers what Slice 8 left to a reverse proxy. Confirm the HSTS setting for any custom domain.
  - Docs: a "Deploy to Vercel" section in the README, covering env vars, region, migrations and preview databases.
- **Exit:**
  - A preview deployment passes the BDD + specs suite and the Lighthouse budget, run against its URL.
  - Production serves `/api/health` with `200` against the managed database.
  - The rate limit holds across function instances: the contract tests pass against Redis, and the 429 scenario passes on the preview.
  - The Docker Compose smoke test still passes.
- **Neon rework: done.** Checked against Neon's current Vercel integration docs: it injects `DATABASE_URL` (pooled, PgBouncer) and `DATABASE_URL_UNPOOLED` (direct). Changes made:
  - `deployEnv.ts`: `migrationUrl()` (`DIRECT_URL` → `DATABASE_URL_UNPOOLED` → `DATABASE_URL`), used by the migration script (originally `prisma.config.ts`). The `vercel-build` guard accepts either direct name and refuses a `-pooler` host as the direct URL. Tests cover all of these.
  - `dbConfig` tests: Neon pooled and direct hosts get verified TLS, with or without `sslmode` in the URL (no code change was needed).
  - `deployment.ts`: `connectionTimeoutMillis` 15 s on Vercel (a suspended Neon compute must start first), 5 s on Docker (previously no timeout).
  - README "Deploy to Vercel" now describes the Neon integration: the production branch plus a branch per preview.
  - `.env.example`: Neon-style example URLs.
  - Nothing in the application code, the schema or the migrations changes: Neon is standard PostgreSQL 16+.
  - Still to confirm on the first real preview: that the branch's variables are present during the build (when `vercel-build` migrates), not only at runtime.
- **Verified locally (October 24, 2026)**, everything short of a real deployment:
  - `npm run vercel-build` with Vercel's variables (`VERCEL=1`, `VERCEL_ENV=preview`, `DATABASE_URL` / `DATABASE_URL_UNPOOLED`, Upstash placeholders): the guard passed, migrations ran through the direct URL, and the build produced Vercel output (no standalone server).
  - Remote E2E mode against that build served locally, run as `preview.yml` does: 34 passed with the 3 `@db-direct` tests correctly excluded (no database URL), then the rate-limit scenario alone passed.
  - Lighthouse remote mode (`LH_URL`): median FCP 228 ms (budget < 1.2 s), PASS.
  - Fixed on the way: the Lighthouse script crashed when a secondary metric (CLS) came back without a value, and passed `extraHeaders: undefined` without a bypass secret. It now reports missing secondary metrics as empty, only sends `extraHeaders` when set, fails clearly on Lighthouse run errors and on a missing FCP, and retries a run up to twice on Lighthouse's transient trace errors (e.g. `NO_NAVSTART`).
  - Not verifiable without your Vercel project: a real preview and production deployment, Neon branch variables being present during the build, and the rate limit holding across real function instances.
- **Status:** code and tests done; deployment not yet performed (needs your Vercel project, see the README checklist). What changed against the plan above:
  - D17 switched to migrating inside `vercel-build` (see the decisions table); there is no separate CI migration job. (The Prisma Postgres code pass also assumed a shared preview database; with Neon, D18 is a branch per preview.)
  - The rate-limit contract (5 behavioral cases) runs against the memory store in unit tests and against real Redis 7 behind an Upstash-compatible REST proxy (SRH) in integration tests. The SRH image is community-maintained and was last updated in 2024; it is used only in tests.
  - On Vercel, `clientIp` trusts `x-vercel-forwarded-for`: Vercel documents that it overwrites the forwarding headers, so the spoofing caveat for Docker doesn't apply there.
  - `db.ts` now builds a `pg` `Pool` (5 connections, 5 s idle timeout on Vercel; 10 / 10 s on Docker) and calls `attachDatabasePool` on Vercel.
  - The `build` script ran `prisma generate` itself; since Prisma was removed it is just `next build`.

### After Slice 9: Prisma removed

Prisma (ORM, client generator and Migrate) was removed entirely, and the project standardized on npm. SRS v1.1.0 later made this the requirement (native `pg` driver, parameterized SQL, SQL migration scripts).

- **Database access:** `src/lib/calculationsRepo.ts` (insert, list, find, ping) with bind parameters over the shared `pg` pool in `src/lib/db.ts`. The pool logs errors from idle clients instead of crashing (Neon can drop idle connections when it suspends). The API routes and their responses are unchanged.
- **Migrations:** `db/migrations/0001_init.sql` is the former Prisma migration, unchanged. `src/lib/migrate.ts` applies pending files in order, each in its own transaction, records them in `schema_migrations`, and takes a PostgreSQL advisory lock so concurrent deploys can't race. A database that Prisma Migrate already created (its tables exist but `schema_migrations` is empty) gets `0001_init` recorded as applied instead of run again. `npm run db:migrate` runs it locally, in the Docker `migrate` service and in `vercel-build`.
- **Tests (test-first):** unit tests for migration file loading (order, naming, duplicates, empty files). Integration tests against PostgreSQL 16: an empty database, idempotent re-runs, adopting a Prisma-created database without losing rows, rollback of a failing file, and two concurrent runs. The existing API integration suite now runs on the new runner and pool.
- **Removed:** `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `prisma/`, `prisma.config.ts`, the generated client, and the `db:generate` / `db:validate` scripts and CI steps.
- **Package manager:** npm only. A partial pnpm install, yarn files and Yarn Plug'n'Play loaders (`.pnp.cjs`, which broke ESLint's plugin resolution) were removed and `node_modules` reinstalled with npm.
- **Security:** a fresh install surfaced `zod@4.1.11` nested under `@vercel/functions` → `@vercel/oidc` → `@vercel/cli-config` (GHSA-mrhx-c7xc-m3w5). An npm `overrides` entry points it at the project's `zod`; `npm audit` reports 0 vulnerabilities.
  - Remote E2E: `E2E_BASE_URL` targets a deployment (no local server). `@db-direct` scenarios (save, comparison, XSS) run only when that deployment's `DATABASE_URL` is supplied. `.github/workflows/preview.yml` runs on each successful preview deployment.
  - A local build with `VERCEL=1` succeeds and produces no standalone output.

---

## 4. Risks and Mitigations

| Risk | Mitigation |
| :--- | :--- |
| Floating-point drift over 360 periods | Cents-based arithmetic (D4); property test that Σ principal equals P |
| Under-50 ms target missed with large schedules or charts | Engine benchmark budget; virtualized table; chart animations off; memoize; downsample chart points above ~120 |
| Spec ambiguity (D8–D12) | Resolve before the matching slice; record the answer in the BDD so it stays the source of truth |
| IRR solver divergence on extreme inputs | Bounded bisection fallback; explicit error type shown in the UI |
| In-memory rate limiter resets on restart / not shared across instances | Acceptable for the single-container deployment; documented limitation. On Vercel, a shared store (D16) |
| SRS §3.5 requires Docker Compose; Vercel is a different runtime | Keep both targets from the same code; the Compose smoke test stays in CI so the SRS path never regresses |
| On Vercel each serverless instance would count requests separately, so 60/min per IP wouldn't hold | Shared rate-limit store behind one interface (D16); contract tests run against both stores |
| Serverless instances exhausting PostgreSQL connections | Pooled connection string, small per-instance pool, idle clients released on suspend |
| Preview deployments migrating or polluting production data | Each environment migrates only its own direct URL (D17); each preview gets its own Neon branch (D18). If the integration is set up wrongly and a preview inherits production variables, it would touch production, so confirm the first preview's `DATABASE_URL` host differs from production before merging |
| Neon compute scales to zero when idle, so the first query after a pause is slower | Calculations run in the browser, so PERF1 is unaffected; only the first save/list after idle waits. Generous connection timeout; on a paid plan, disable scale-to-zero for production if the delay matters |
| Preview branches copy production data | Copy-on-write branches start with production's rows. Acceptable here (saved calculations hold no personal data); revisit before adding users or sensitive data |
| Branch-per-preview depends on the Neon–Vercel integration and its plan limits; branches live until Vercel removes the deployment | Delete stale `preview/*` branches in the Neon console, shorten Vercel's deployment retention, or fall back to one shared staging branch |
| Cold starts on API routes | Calculations run in the browser, so PERF1 is unaffected; only save/list latency changes. Co-locate the function region with the database |
| E2E steps that write SQL directly can't reach a remote database | Tag them `@db-direct` and skip them for remote runs, or provide a preview database secret |
| E2E flakiness on timing assertions | Measure with `performance.measure` in-page, use p95 over many samples, fixed CI profile |
| Server-side recompute disagrees with client due to environment differences | Same engine module, no `Date.now()` or locale dependence inside it; dates passed in |

## 5. Rough Sizing

| Slice | Effort |
| :--- | :--- |
| 0 Scaffold | 0.5 day |
| 1 Fixed-rate engine | 1 day |
| 2 Extra payments + revolving + IO balloon | 1 day |
| 3 Business engines + IRR | 2 days |
| 4 Validation + forms | 1.5 days |
| 5 Results UI + perf | 2 days |
| 6 Docker + DB + API | 2 days |
| 7 Comparison + export | 1.5 days |
| 8 Hardening | 1.5 days |
| 9 Vercel hosting | 2 days |
| **Total** | **about 15 days** for one developer |

## 6. Suggested First Commands (Slice 0)

```bash
npx create-next-app@latest . --ts --tailwind --app --eslint --src-dir
npm i zod @prisma/client recharts jspdf jspdf-autotable
npm i -D vitest @vitest/coverage-v8 fast-check @testing-library/react @testing-library/jest-dom jsdom \
        @playwright/test playwright-bdd testcontainers prisma
```

Start work with `tests/unit/payment.test.ts` (the first failing test), not with the UI.
