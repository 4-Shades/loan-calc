# Test-Driven Design (TDD) Plan
## LoanCalc-SPA: Multi-Type Loan & Amortization Engine

**Derived from:** `software_requirements_specification.md` (SRS v1.0.0) and `gherkin_bdd_feature_specs.md`
**Stack:** TypeScript (strict), Next.js App Router, PostgreSQL via `pg` with parameterized SQL (no ORM; see implementation plan D1), Zod, Docker

---

## 1. Approach

Development follows Red → Green → Refactor. The BDD scenarios are the acceptance tests and the outer loop. Unit tests are the inner loop.

1. Pick one BDD scenario and write it as a failing acceptance test (Red).
2. Drop to unit level. Write the smallest failing unit test for the next missing piece.
3. Make it pass with minimal code (Green). Repeat until the acceptance test passes.
4. Refactor with all tests green.

**Design rule:** the calculation engine is a pure, framework-free TypeScript module (`src/engine/`). It does no I/O, no React, no DB and no `Date.now()`. This makes it:
- fast to unit test (REQ-NFR-PERF1, under 50 ms)
- reusable on the client for real-time recalculation and on the server for validation
- deterministic, because dates are passed in

### 1.1 Tooling

| Concern | Tool |
| :--- | :--- |
| Unit / integration runner | Vitest |
| Property-based tests | fast-check |
| Component tests | React Testing Library + Vitest (jsdom) |
| E2E + BDD acceptance | Playwright, with `playwright-bdd` (or Cucumber.js) reading the `.feature` files |
| DB integration | Testcontainers (`postgres:16-alpine`) |
| API mocking | none; real route handlers against the Testcontainers DB |
| Perf | Vitest `bench` (engine) + Playwright tracing / Lighthouse CI (UI) |
| Coverage | `@vitest/coverage-v8`, gate at 90% lines for `src/engine/`, 80% overall |

### 1.2 Test pyramid

```
            /\        E2E / BDD acceptance (Playwright)     ~10 tests
           /  \       Integration (API + Postgres)           ~20 tests
          /    \      Component (React Testing Library)      ~30 tests
         /______\     Unit + property (engine, Zod, utils)   ~100+ tests
```

### 1.3 Proposed layout

```
features/                       # the Gherkin file split per feature, run by Playwright-BDD
src/engine/
  payment.ts                    # PMT, interest-only, balloon
  schedule.ts                   # amortization schedule generator
  extraPayments.ts              # term reduction + interest savings
  revolving.ts
  business/{term,equipment,mca,graceInterestOnly}.ts
  irr.ts                        # Effective APR (IRR / XIRR solver)
  money.ts                      # rounding helpers
src/schemas/                    # Zod schemas (shared client + server)
src/app/api/calculations/route.ts
src/lib/{csv,rateLimit,sanitize}.ts
tests/unit/  tests/component/  tests/integration/  tests/e2e/
```

---

## 2. Requirement-to-Test Traceability Matrix

Final state after Slice 8. Every requirement has at least one passing automated check. Paths are relative to `tests/` unless noted; "BDD" means the scenario in `features/` runs in Playwright.

| Requirement | BDD scenario | Level | Tests |
| :--- | :--- | :--- | :--- |
| REQ-FUNC-PL01 | Fixed-rate outline; Revolving LOC | Unit, property, BDD | `unit/engine/payment.test.ts`, `schedule.test.ts`, `interestOnly.test.ts`, `revolving.test.ts` |
| REQ-FUNC-PL02 | Fixed-rate outline | Unit (Zod), component, BDD | `unit/schemas/loanInput.test.ts`, `component/Calculator.test.tsx` |
| REQ-FUNC-PL03 | Extra payments | Unit, property, BDD | `unit/engine/extraPayments.test.ts`, `schedule.property.test.ts` |
| REQ-FUNC-BL01 | MCA; Grace period; Equipment | Unit, property, BDD | `unit/engine/business/*.test.ts` |
| REQ-FUNC-BL02 | Grace period; MCA | Unit (Zod), BDD | `unit/schemas/loanInput.test.ts`, `unit/engine/business/fees.test.ts` |
| REQ-FUNC-BL03 | MCA effective APR | Unit, property, BDD | `unit/engine/irr.test.ts`, `business/mca.test.ts`, `business/business.property.test.ts` |
| REQ-FUNC-AN01 | (all calculator scenarios) | Unit, property, component | `unit/engine/schedule*.test.ts`, `component/AmortizationTable.test.tsx` |
| REQ-FUNC-AN02 | none | Unit, component, a11y | `unit/lib/chartData.test.ts`, `component/Charts.test.tsx`, `e2e/specs/accessibility.spec.ts` |
| REQ-FUNC-DB01 | Save to PostgreSQL | Integration, component, BDD | `integration/calculations.api.test.ts`, `component/SaveCalculation.test.tsx` |
| REQ-FUNC-DB02 | Comparison matrix | Unit, component, BDD | `unit/lib/comparison.test.ts`, `component/SavedCalculations.test.tsx` |
| REQ-FUNC-DB03 | Export CSV | Unit, component, BDD, E2E | `unit/lib/csv.test.ts`, `unit/lib/pdf.test.ts`, `component/ExportButtons.test.tsx`, `e2e/specs/security.spec.ts` (PDF + CSV under CSP) |
| REQ-UI-001 | Slider recalculation; extra payments | BDD | `e2e/steps/performance.steps.ts` (no-reload fixture in `fixtures.ts`) |
| REQ-UI-002 | none | E2E (320 / 768 / 1024 px) | `e2e/specs/responsive.spec.ts` |
| REQ-UI-003 | Background (mode set) | Component, BDD | `component/ModeToggle.test.tsx`, `component/Calculator.test.tsx` |
| REQ-INT-001 | none | Unit, integration | `unit/lib/dbConfig.test.ts`, `integration/calculations.api.test.ts` (pool reuse) |
| REQ-INT-002 | none | Systems | `scripts/compose-smoke.sh` (`npm run test:compose`) |
| REQ-NFR-PERF1 | Slider under 50 ms | Perf budget, BDD | `perf/engine.budget.test.ts`, `e2e/steps/performance.steps.ts` (p95 from browser timings) |
| REQ-NFR-PERF2 | none | Lighthouse (desktop preset) | `scripts/lighthouse.mjs` (`npm run test:lighthouse`) |
| REQ-NFR-CODE1 | none | Static | `tsc --noEmit` (`strict`, `noUncheckedIndexedAccess`), ESLint `no-explicit-any` |
| REQ-NFR-CODE2 | Save scenario (Zod payload) | Unit, integration | `unit/schemas/*.test.ts`, `integration/calculations.api.test.ts` |
| REQ-NFR-SEC1 | none | Unit, integration, E2E, lint | `unit/lib/sanitize.test.ts`, `unit/lib/securityHeaders.test.ts`, `integration/calculations.api.test.ts` (XSS, SQLi), `e2e/specs/security.spec.ts`, ESLint `react/no-danger` |
| REQ-NFR-SEC2 | Rate limiting | Unit, integration, BDD | `unit/lib/rateLimit.test.ts`, `integration/calculations.api.test.ts` |

Requirements with no BDD scenario (AN02, UI-002, INT-001/002, PERF2, CODE1, SEC1) are covered by the tests above; adding scenarios for them is optional and would be a spec change.

---

## 3. Engine Unit Tests (inner loop)

### 3.1 Implementation order

Each step is written test-first, and each gets the failing test before any code.

1. `money.ts`: rounding to cents, half-up
2. `payment.ts`: fixed-rate PMT
3. `schedule.ts`: schedule generator with last-payment cleanup
4. `extraPayments.ts`
5. `revolving.ts`
6. `graceInterestOnly.ts`
7. `equipment.ts`
8. `irr.ts`
9. `mca.ts`
10. `term.ts` (SBA, with fees)

### 3.2 Fixed-rate installment loan (REQ-FUNC-PL01, PL02)

```ts
describe('fixedPayment', () => {
  it.each([
    // principal, apr, months, payment
    [10000, 5.0, 24, 438.71],
    [25000, 8.5, 60, 512.91],
    [5000, 12.0, 12, 444.24],
  ])('P=%d APR=%d n=%d → %d', (P, apr, n, expected) => {
    expect(fixedPayment({ principal: P, apr, periods: n, periodsPerYear: 12 }))
      .toBeCloseTo(expected, 2);
  });

  it('handles 0.01% APR without NaN/Infinity', ...);
  it('handles 100% APR', ...);
  it('weekly / bi-weekly / annual use periodsPerYear 52 / 26 / 1', ...);
  it('returns principal / n when rate is exactly 0 (guard divide-by-zero)', ...);
});
```

**Schedule tests** (Scenario Outline examples):

| # | Test | Expected |
| :-- | :--- | :--- |
| 1 | Periods count equals term (24, 60, 12) | exact |
| 2 | Total interest matches expectation | exact to the cent (values corrected per D8, see §8 item 1) |
| 3 | First row: interest = balance × periodic rate | exact to the cent |
| 4 | Final balance is `0.00` | exact |
| 5 | Each row: `principal + interest == payment` | exact, except possibly the last row |
| 6 | Balance is monotonically non-increasing | all rows |
| 7 | Sum of principal column equals original principal | exact to the cent |
| 8 | Final payment absorbs rounding drift | exact: 438.82 / 513.17 / 444.29 (drift can exceed 5¢, e.g. 26¢ on the 60-month loan) |

### 3.3 Property-based tests (REQ-FUNC-AN01)

For any valid input (`P ∈ [100, 500000]`, `APR ∈ [0.01, 100]`, term 1–360 months, frequency ∈ {52, 26, 12, 1}):
- Σ principal = P exactly
- ending balance = 0
- no negative principal, interest or balance in any row
- `totalInterest = Σ payments − P`
- row count ≤ n (a payment rounded up to the cent can finish a tiny loan early)
- monotonic: higher APR ⇒ regular payment never lower

Findings from implementing Slice 1:
- **Total interest is not strictly monotonic in APR** once payments are rounded to the cent. fast-check found $100 bi-weekly over 163 periods: at 52.34% the payment rounds down ($2.09) and at 53.34% it rounds up ($2.13), so the higher APR pays off earlier and costs less. Kept as a regression test.
- **Some valid-looking inputs cannot amortize at cent precision** (e.g. 50% APR over 30 years): the exact payment is less than half a cent above the interest. The engine rejects these with a `RangeError`; about 17% of uniformly random inputs in the domain above. Slice 4 must turn this into a form validation message.

### 3.4 Extra payments (REQ-FUNC-PL03)

```ts
it('$20k @6% 48mo + $100/mo extra reduces term by ≥ 7 months', () => {
  const base  = buildSchedule({ principal: 20000, apr: 6, periods: 48 });
  const accel = buildSchedule({ principal: 20000, apr: 6, periods: 48, extra: { recurring: 100 } });
  expect(base.length - accel.length).toBeGreaterThanOrEqual(7);
  expect(totalInterest(base) - totalInterest(accel)).toBeGreaterThan(400);
});
```

Verification run (see §8): reference calculation gives 48 → 39 periods (9 months saved) and about $498 interest savings, so the BDD thresholds hold.

Additional cases:
- one-time extra payment applied in period k
- extra larger than the remaining balance: the final payment is capped, with no negative balance
- extra = 0 ⇒ output identical to the baseline
- `summary.termReduction` and `summary.interestSaved` fields are populated

### 3.5 Revolving line of credit (REQ-FUNC-PL01)

| Case | Input | Expect |
| :--- | :--- | :--- |
| Scenario example | bal $8,000, 18%, min 2.5% | payment 200.00, interest 120.00, principal 80.00 |
| Floor | min-pay rule below some floor (if specified, see §8) | floor applied |
| Next period | after row 1, balance 7,920 | interest 118.80, payment 198.00 |
| Termination | simulation ends at balance 0 or a cap on periods | no infinite loop |

### 3.6 Interest-only with grace period (REQ-FUNC-BL01, BL02)

| Test | Expect |
| :--- | :--- |
| $100k, 7.5%, 36 mo, grace 6 | periods 1–6: principal = 0, payment = 625.00 |
| Period 7 onward | amortizes full $100,000 over 30 periods |
| Post-grace payment | equals `fixedPayment(100000, 7.5, 30)` (≈ $3,665.97) |
| Final balance | 0.00 |
| grace = 0 | identical to a normal amortized loan |
| grace ≥ term | rejected by validation |

### 3.7 Equipment financing (REQ-FUNC-BL01)

| Test | Expect |
| :--- | :--- |
| price 150,000, down 30,000 | financed principal = 120,000 |
| down payment given as % (20%) vs flat | same result |
| residual 15,000 | final-period balloon of 15,000 is included in the last payment |
| down payment ≥ price | validation error |
| residual > financed principal | validation error |

> The BDD does not state how regular payments are computed when a residual exists. See §8, item 3.

### 3.8 Merchant cash advance and Effective APR (REQ-FUNC-BL01, BL03)

```ts
it('MCA $50k, factor 1.25, 6 months daily', () => {
  const r = calcMca({ advance: 50000, factorRate: 1.25, termMonths: 6, frequency: 'daily' });
  expect(r.totalPayback).toBe(62500.00);
  expect(r.financeCharge).toBe(12500.00);
  expect(r.effectiveApr).toBeGreaterThan(45);
});
```

- **IRR solver (`irr.ts`)**: tested against known cash-flow vectors with published IRR values, and against `payment=PMT` to confirm the IRR equals the nominal periodic rate.
- Cross-check: MCA Effective APR equals the IRR of `[-advance, +dailyPayment × N]` annualized. The SRS verification matrix requires this "standard IRR calculation" check.
- Factor-rate bounds: 1.05 and 1.50 accepted; 1.04 and 1.51 rejected.
- Daily vs weekly withholding gives different Effective APR for the same factor and term.
- Fee-heavy term loan: Effective APR is greater than the stated rate when origination fees are present.
- Solver convergence: no NaN and no infinite loop for extreme inputs (iteration cap, with a clear error if it does not converge).

### 3.9 Term / SBA loan with fees (REQ-FUNC-BL01, BL02)

- Flat fee vs % of principal: the same dollar result gives the same schedule.
- Fees appear in the `Fees` column and in the Effective APR.
- Fees are deducted from proceeds (D12): payments on the full amount, fees in a period-0 closing row, Effective APR on net proceeds.

### 3.10 Rounding policy

- Money is computed in integer cents (or `Decimal`) internally; never accumulate raw floats across 360 periods without rounding.
- Tests: schedule for 30-year monthly loan sums to the cent; no `-0.00`; no `0.0000001` residual balance.

---

## 4. Validation Tests (Zod, REQ-NFR-CODE2)

The same schemas run client-side (form) and server-side (API).

| Field | Valid | Invalid (must fail with specific message) |
| :--- | :--- | :--- |
| principal | 100, 500000 | 99.99, 500000.01, NaN, negative, string |
| apr | 0.01, 100 | 0, 0.009, 100.01 |
| term | integer ≥ 1 (months or years) | 0, 1.5 months, negative |
| frequency | Weekly, Bi-Weekly, Monthly, Annually | "Daily" for personal, unknown strings |
| extra payment | ≥ 0 | negative |
| factorRate | 1.05–1.50 | 1.049, 1.501 |
| gracePeriod | 0 ≤ g < term | g ≥ term, negative |
| title (save) | 1–150 chars | empty, 151 chars |
| loanType | known enum | unknown |

Also: the `inputs` and `summary_results` JSONB payload shape is validated on save.

---

## 5. Component Tests (React Testing Library)

| Component | Behavior to specify first |
| :--- | :--- |
| `ModeToggle` | Switches Personal ↔ Business (REQ-UI-003); swaps visible input fields. |
| `LoanForm` | Shows type-specific inputs (e.g., grace period only for Interest-Only, factor rate only for MCA). Inline Zod errors appear. |
| `AmortizationTable` | Renders the columns Period, Date, Payment, Principal, Interest, Fees, Remaining Balance; paginates / virtualizes for 360 rows. |
| `Charts` | Renders cumulative principal vs interest and the donut chart; updates when inputs change (REQ-FUNC-AN02). |
| `ComparisonMatrix` | With 3 saved scenarios: 3 columns; lowest total interest cell has the "green" class; lowest monthly payment cell has the "blue" class; cannot select a 4th scenario. |
| `SaveForm` | Disabled when the title is empty; shows the UUID in the success toast; shows an error toast on 4xx/5xx. |

Comparison-matrix fixtures come directly from the BDD data table. Note that the highlight assertions need a defined tie-breaking rule (see §8).

---

## 6. Integration Tests (API + PostgreSQL)

Run against a Testcontainers Postgres with the schema from SRS §3.3 applied via migration. Each test uses a clean transaction or truncates tables.

### 6.1 `POST /api/calculations` (REQ-FUNC-DB01)

| Test | Expect |
| :--- | :--- |
| valid payload | 201; a row exists in `saved_calculations`; `inputs` and `summary_results` JSONB equal the payload; response contains a UUID `id` |
| `created_at` / `updated_at` | populated by default |
| invalid payload (Zod) | 400 with field-level errors; no row inserted |
| title with `<script>` | stored sanitized / escaped (REQ-NFR-SEC1) |
| title with `'; DROP TABLE saved_calculations;--` | stored literally; table intact (parameterized queries) |
| oversize JSON body | 413 or 400 |

### 6.2 Retrieval

- `GET /api/calculations` returns newest first (uses `idx_calculations_created`).
- `GET /api/calculations/:id` returns 404 for an unknown UUID and 400 for a malformed one.

### 6.3 Rate limiting (REQ-NFR-SEC2)

```ts
it('returns 429 after 60 POSTs/min from one IP', async () => {
  for (let i = 0; i < 60; i++) expect((await post(validBody, ip)).status).toBe(201);
  const res = await post(validBody, ip);
  expect(res.status).toBe(429);
  expect(await res.json()).toMatchObject({ error: expect.stringMatching(/rate limit/i) });
});
it('limit is per IP: a second IP is unaffected', ...);
it('window resets after 60s (fake timers)', ...);
```

### 6.4 DB connection (REQ-INT-001)

- Pool is reused across requests (no new connection per request).
- In non-local `NODE_ENV`, the connection string requires `sslmode=require` (config test).

---

## 7. End-to-End Acceptance Tests (outer loop)

Each BDD scenario in `gherkin_bdd_feature_specs.md` becomes an executable spec. Step definitions use Playwright. **Keep the `.feature` files as the single source of truth.**

| Scenario | Key assertions |
| :--- | :--- |
| Standard fixed-rate (3 examples) | Payment, total interest and row count shown in the UI match the Examples table to the cent (D8). |
| Extra payments | Term reduction and interest savings are shown; **no navigation / reload** (assert `page.on('framenavigated')` count stays 0 after the first load). |
| Revolving LOC | Shows $200.00 / $120.00 / $80.00. |
| MCA | Total payback $62,500.00; finance charge $12,500.00; Effective APR above 45%. |
| Grace period | Rows 1–6 principal $0.00 and payment $625.00; row 7 principal > 0. |
| Equipment | Financed principal $120,000; balloon row present. |
| Save | Fill the title, click Save; assert the POST to `/api/calculations`, a toast with a UUID, and a row in the DB. |
| Comparison | Select 3 saved scenarios; the modal opens without reload; green / blue highlight on the expected cells. |
| Export CSV | Download is named `loan-amortization-schedule.csv`; header is exactly `Period,Date,Payment,Principal,Interest,Fees,Remaining Balance`; 36 data rows. |
| Slider | Drag APR 5.00 → 7.50; the table updates; no navigation; measured recalculation + render under 50 ms (see §7.1). |
| Rate limit | 61st POST in a minute gets 429 and a JSON error body. |

### 7.1 Performance tests (REQ-NFR-PERF1, PERF2)

- **Engine bench (Vitest bench):** a 360-period schedule plus summary in under 5 ms median on CI hardware. This is the budget that makes the UI target achievable.
- **UI:** use `performance.mark/measure` around the slider's `onChange` → commit. Assert p95 under 50 ms over 50 drag events. Run on a fixed CI profile and allow headroom, to avoid flakes.
- **Lighthouse CI:** FCP under 1.2 s on the production build.

### 7.2 Responsive (REQ-UI-002)

Playwright viewport matrix: 320, 768, 1024 px. Assert no horizontal scroll, inputs visible, and the table readable.

### 7.3 Systems / infra (REQ-INT-002)

Script: `docker compose up --build -d`, then wait for health, then `curl localhost:3000` returns 200, then POST a calculation, then restart the app container and confirm the data is still present (volume persistence). Also verify the runner container runs as non-root (`docker exec ... id -u` ≠ 0).

### 7.4 Static quality gates (REQ-NFR-CODE1)

CI runs `tsc --noEmit` with `strict: true` and ESLint with `@typescript-eslint/no-explicit-any: error`. It fails the build on any violation.

---

## 8. Spec Issues Found While Designing Tests

These need a decision before the matching tests can be finalized. Items 1–3 are real discrepancies in the BDD.

1. **Total-interest examples are off by cents.** Recomputing with the standard annuity formula gives:

   | Case | BDD says | Computed |
   | :--- | :--- | :--- |
   | $10,000 / 5% / 24 | 529.04 | 529.13 |
   | $25,000 / 8.5% / 60 | 5774.60 | 5774.80 |
   | $5,000 / 12% / 12 | 330.88 | 330.93 |

   Payments (438.71, 512.91, 444.24) are correct. **Resolved (D8):** the BDD now uses the totals from the actual cent-rounded schedule: **529.15 / 5774.86 / 330.93**. The original values were rounded payment × n − P, which ignores the final payment's rounding adjustment; the "Computed" column above used the unrounded payment. Tests assert to the cent.
2. **Revolving LOC "initial payment".** Math checks out (2.5% × 8,000 = 200; interest 18%/12 × 8,000 = 120; principal 80). **Resolved (D11):** the minimum is the percentage of the current balance, recomputed each period, with no floor; the engine caps the number of periods so it terminates.
3. **Equipment residual / balloon.** "Final period balloon payment should account for the $15,000 residual" is ambiguous. Two interpretations give different regular payments for $120,000 / 6.5% / 48 mo:
   - Level payments sized so $15,000 remains at the end: **$2,571.32**
   - Fully amortizing payment plus a $15,000 extra at the end: **$2,845.79**

   **Resolved (D9):** balloon loan, $2,571.32 × 47 then $17,571.37 (the $15,000 residual plus 5¢ of rounding).
4. **MCA Effective APR.** The BDD only says "exceeding 45%". The result depends on convention: 6 months of daily withholding gives roughly 92% (simple annualized IRR) up to about 150% (compounded, business-day basis). The threshold is safe, but the SRS verification row ("matches standard IRR calculation") needs a stated convention (days/year, business days or calendar days, simple vs compounded) before an exact test is possible. **Resolved (D10):** nominal APR = periodic IRR × periods per year, daily = 252 business days; the BDD case is 92.22%.
5. **Comparison matrix fixtures.** The monthly payments in the BDD table are inputs, not outputs of the engine ($3,096.64 vs a computed ≈ $3,096.86 for $100k at 7.2% over 36 months; the terms are not given). Treat them as static fixtures for UI highlight tests only. Tie-break rule for equal values (highlight both?) is undefined. The table shows no "total interest" column, but the scenario asserts "lowest total interest highlighted in green", so the fixtures need that value. **Resolved (Slice 7):** the scenario table now has a Total Interest column ($11,479.04 / $24,999.80 / $12,976.16); ties highlight every tied option; the comparison uses interest + fees and monthly-equivalent payments.
6. **Coverage gaps (requirements with no BDD scenario):** REQ-FUNC-AN02 (charts), REQ-UI-002 (responsive), REQ-UI-003 (mode toggle is only a Background step), REQ-NFR-SEC1 (XSS / SQLi), REQ-NFR-PERF2 (FCP), REQ-INT-001/002, REQ-FUNC-DB03 PDF export (BDD covers CSV only), Interest-Only with Balloon personal loan (PL01 item 2), SBA fees (BL01 item 1), and non-monthly frequencies. This plan adds tests for them above, but the Gherkin should be extended so behavior stays specified in one place.
7. **Minor:** scenario says "Given a client client IP address" (duplicated word); 429 body's JSON shape is not defined (this plan assumes `{ "error": "..." }`); "up to 3" comparison allows 2, and selecting 1 or 0 is unspecified.
8. **Rate-limit state in multi-instance deployments:** an in-memory limiter is per-process. Fine for the single-container compose setup, but note it as a limitation.

---

## 9. Suggested Delivery Order (vertical slices)

| Slice | Contents | Done when |
| :--- | :--- | :--- |
| 0 | Repo scaffold, Vitest, strict TS, ESLint, CI | Empty test run is green in CI |
| 1 | `money`, `payment`, `schedule` + Fixed-rate scenario (unit → E2E) | Scenario Outline passes |
| 2 | Extra payments + Revolving LOC | PL03 + LOC scenarios pass |
| 3 | Grace period, Equipment, `irr`, MCA, SBA | All Business scenarios pass |
| 4 | Zod schemas + form + ModeToggle | Validation tests green |
| 5 | Charts, table, slider, perf budget | PERF1 bench + E2E pass |
| 6 | Docker, Postgres, `POST /api/calculations`, rate limit | DB01, SEC2, INT-002 pass |
| 7 | Comparison matrix, CSV / PDF export | DB02, DB03 pass |
| 8 | Hardening: XSS / SQLi, responsive, Lighthouse | All of §2 is green |

## 10. Definition of Done (per slice)

- All new BDD scenarios are green, with no skipped or pending tests.
- Every new requirement ID in the slice appears in the traceability matrix (§2) with at least one test.
- Engine coverage is 90% or higher; overall coverage is 80% or higher.
- `tsc --noEmit`, lint and the unit and integration suites pass in CI.
- No test depends on wall-clock time, the network, or test order.
