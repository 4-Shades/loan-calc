# Implementation Plan
## LoanCalc-SPA: Multi-Type Loan & Amortization Engine

**Inputs:** `software_requirements_specification.md` (SRS), `gherkin_bdd_feature_specs.md` (BDD), `tdd_design.md` (TDD)
**Approach:** vertical slices, test-first. Each slice starts with failing tests from the TDD plan and ends with them green.

---

## 1. Decisions to Lock In First

These are defaults I would use. Items marked **Open** come from TDD §8 and need your call before the matching slice.

| # | Decision | Default | Status |
| :-- | :--- | :--- | :--- |
| D1 | ORM | Prisma (mature migrations, works with Testcontainers) | Proposed |
| D2 | Charts | Recharts (React-native, simple donut + area charts) | Proposed |
| D3 | UI kit | Tailwind + shadcn/ui | Per SRS |
| D4 | Money arithmetic | Integer cents internally; round half-up per period | Proposed |
| D5 | PDF export | `jspdf` + `jspdf-autotable`, client-side (SRS: "from SPA state") | Proposed |
| D6 | Rate limiter | In-memory sliding window keyed by IP (single container) | Proposed |
| D7 | Engine location | Pure TS in `src/engine/`, imported by client and server | Per TDD |
| D8 | Total-interest values in BDD | Corrected to the cent-rounded schedule totals (529.15 / 5774.86 / 330.93); asserted exactly | Decided |
| D9 | Equipment residual | Balloon loan: level payments leaving the residual at term end, repaid with the final payment ($2,571.32 for the BDD case) | Decided |
| D10 | MCA Effective APR convention | Nominal (Reg Z style): periodic IRR × periods per year; daily = business days, 252/yr, 21/month (92.22% for the BDD case) | Decided |
| D11 | Revolving minimum | % of current balance each period, no floor | Decided |
| D12 | Fees on term/SBA loans | Deducted from proceeds: payments on the full amount, fees in a period-0 closing row, Effective APR on net proceeds. Applies to all business loan types | Decided |
| D13 | Auth | None. The SRS defines no users; saved calculations are global | Per SRS |

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
prisma/schema.prisma  prisma/migrations/
features/*.feature        # Gherkin, split per feature
tests/{unit,component,integration,e2e}/
Dockerfile  docker-compose.yml  .github/workflows/ci.yml
```

**Data flow:** form state → Zod parse → `calculate()` (client, sync) → `{summary, schedule}` → table, charts, summary cards. Saving posts `{title, loanType, inputs, summary}` to `/api/calculations`. The server re-validates with the same Zod schema and re-runs `calculate()` to confirm `summary_results` matches the inputs, so a client cannot store forged results.

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

- **Red:** Testcontainers integration tests (TDD §6); `rateLimit.test.ts`; `sanitize.test.ts`; `compose.smoke.sh`.
- **Green:**
  - `docker-compose.yml` from the SRS (port 3000 / 5432, healthcheck, `depends_on: service_healthy`). Move the DB password to an `.env` file that is not committed; the SRS example hard-codes it.
  - Multi-stage `Dockerfile` (deps → builder, runs `prisma generate` and `next build` with `output: 'standalone'` → runner with `USER node`). The app container runs `prisma migrate deploy` on start.
  - `lib/db.ts`: singleton Prisma client (avoids connection storms in dev hot reload); SSL required when `NODE_ENV=production` and the host is not local.
  - `POST /api/calculations`: rate limit → body-size check → Zod parse → sanitize title → server-side recompute and compare → insert → `201 { id }`. Errors return JSON `{ error, details? }`; 429 includes `Retry-After`.
  - `GET /api/calculations` (newest first, paginated) and `GET /api/calculations/[id]`.
  - `SaveForm`: toast with the UUID on success.
- **Exit:** `docker compose up --build` works on a clean checkout; the Save scenario and the 429 scenario pass; data survives an app restart.
- **Status:** done. `npm run test:compose` builds the stack from scratch, saves, restarts the app, reads the row back and confirms uid 1000 (`node`); the Save and 429 BDD scenarios pass; 21 integration tests pass against PostgreSQL 16 in Testcontainers. Changes and choices:
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

---

## 4. Risks and Mitigations

| Risk | Mitigation |
| :--- | :--- |
| Floating-point drift over 360 periods | Cents-based arithmetic (D4); property test that Σ principal equals P |
| Under-50 ms target missed with large schedules or charts | Engine benchmark budget; virtualized table; chart animations off; memoize; downsample chart points above ~120 |
| Spec ambiguity (D8–D12) | Resolve before the matching slice; record the answer in the BDD so it stays the source of truth |
| IRR solver divergence on extreme inputs | Bounded bisection fallback; explicit error type shown in the UI |
| In-memory rate limiter resets on restart / not shared across instances | Acceptable for the single-container deployment; documented limitation |
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
| **Total** | **about 13 days** for one developer |

## 6. Suggested First Commands (Slice 0)

```bash
npx create-next-app@latest . --ts --tailwind --app --eslint --src-dir
npm i zod @prisma/client recharts jspdf jspdf-autotable
npm i -D vitest @vitest/coverage-v8 fast-check @testing-library/react @testing-library/jest-dom jsdom \
        @playwright/test playwright-bdd testcontainers prisma
```

Start work with `tests/unit/payment.test.ts` (the first failing test), not with the UI.
