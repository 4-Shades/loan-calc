# Software Requirements Specification (SRS)
## Single-Page Web Application: Multi-Type Loan & Amortization Engine

**Project:** LoanCalc-SPA  
**Document Version:** 1.0.0  
**Date:** October 20, 2026  
**Tech Stack:** TypeScript, Next.js (App Router), PostgreSQL, Docker  

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) defines the functional, non-functional, database, and infrastructure requirements for the **Multi-Type Loan & Amortization Engine** single-page application (SPA). This document serves as the canonical reference for developers, software architects, and quality assurance engineers.

### 1.2 Scope
The application is a high-performance SPA built with **TypeScript** and **Next.js**, backed by a **PostgreSQL** database, and fully containerized using **Docker**. 

The system enables users to:
* Calculate financial amortization schedules for both **Personal Loans** (Fixed Installment, Reducing Balance, Revolving Credit) and **Business Loans** (SBA/Term Loans, Equipment Financing, Merchant Cash Advance/Factor Rate, Interest-Only Grace Period Loans).
* Perform real-time scenario comparisons side-by-side without page reloads.
* Save, export (PDF/CSV), and retrieve calculated scenarios from PostgreSQL.
* Execute all client interactions within a unified, responsive single-page experience.

### 1.3 System Overview & Tech Stack
* **Frontend:** Next.js (App Router / React), TypeScript, Tailwind CSS, Shadcn UI / Chart.js / Recharts.
* **Backend API:** Next.js API Routes / Server Actions using TypeScript.
* **Database:** PostgreSQL for persistent scenario storage, user audit logs, and loan product templates.
* **ORM:** Prisma or Drizzle ORM (TypeScript native).
* **Containerization:** Docker & Docker Compose (Multi-stage builds for Dev and Production).

---

## 2. Overall Description

### 2.1 Product Perspective
The system operates as an autonomous, containerized web application. It operates in a client-server paradigm within a Docker network environment:
```
[ User Browser (SPA) ] 
       │  (HTTPS / REST / Server Actions)
       ▼
[ Next.js Container (TypeScript / React) ]
       │  (TCP / SQL via ORM)
       ▼
[ PostgreSQL Container (Data Persistence) ]
```

### 2.2 User Characteristics
* **Retail Consumers:** Seeking straightforward personal loan amortization, interest breakdown, and early payoff/extra payment impact analysis.
* **Business Owners / Financial Analysts:** Requiring complex business loan projections, including factor rates, grace period interest-only payments, equipment depreciation tie-ins, and cash flow impacts.

### 2.3 Product Functions (Summary)
1. Dynamic input panel tailored to specific loan categories (Personal vs. Business).
2. Client-side instant calculation engine (sub-50ms execution).
3. Interactive amortization table with pagination and virtual scrolling.
4. Interactive visual charts (Principal vs. Interest, Balance Over Time, Payment Breakdown).
5. Scenario saving, comparison matrix, and export capabilities.

---

## 3. Specific Requirements

### 3.1 External Interfaces

#### 3.1.1 User Interface (UI / UX)
* **[REQ-UI-001] Single Page Architecture:** The entire calculation, comparison, visualization, and export flow MUST execute within a single page without full browser reloads.
* **[REQ-UI-002] Responsive Layout:** The UI MUST dynamically adapt across Mobile (320px+), Tablet (768px+), and Desktop (1024px+) viewports.
* **[REQ-UI-003] Calculation Modes:** The application MUST provide a toggle to switch between **Personal Loan Mode** and **Business Loan Mode**.

#### 3.1.2 Software & Database Interfaces
* **[REQ-INT-001] Database Driver:** Connection to PostgreSQL MUST be secured using SSL/TLS in non-local environments and pooled efficiently using Prisma Client or Drizzle ORM.
* **[REQ-INT-002] Containerization:** Docker Compose MUST expose the application on port `3000` and internal PostgreSQL on port `5432`.

---

### 3.2 Functional Requirements

#### 3.2.1 Personal Loan Engine
* **[REQ-FUNC-PL01] Personal Loan Types:** The system SHALL support calculation for:
  1. Fixed-Rate Installment Loan (Amortized equal payments).
  2. Interest-Only Loan with Balloon Payment.
  3. Revolving Line of Credit (Minimum payment percentage + interest).
* **[REQ-FUNC-PL02] Input Parameters:** The system SHALL accept:
  * Principal Amount ($100 to $500,000)
  * Annual Percentage Rate (APR) (0.01% to 100.00%)
  * Loan Term (Months or Years)
  * Payment Frequency (Weekly, Bi-Weekly, Monthly, Annually)
  * Extra Payments (One-time or recurring monthly additions)
* **[REQ-FUNC-PL03] Extra Payment Impact:** The system SHALL compute term reduction time and total interest savings when extra payments are specified.

#### 3.2.2 Business Loan Engine
* **[REQ-FUNC-BL01] Business Loan Types:** The system SHALL support calculation for:
  1. Traditional Term / SBA Loan (Includes origination fees & SBA guarantee fees).
  2. Equipment Financing (Includes down payment & equipment residual value).
  3. Merchant Cash Advance (MCA) / Factor Rate Loan (Factor rate range: 1.05 to 1.50, daily/weekly withholdings).
  4. Interest-Only Grace Period Loan (e.g., 6 months interest-only, followed by amortized principal + interest).
* **[REQ-FUNC-BL02] Input Parameters:** The system SHALL accept:
  * Loan Amount / Facility Limit
  * Stated Interest Rate OR Factor Rate
  * Origination / Processing Fees (Flat fee or % of total)
  * Grace Period Duration (Months)
  * Daily/Weekly/Monthly Revenue percentage (for MCA calculations)
* **[REQ-FUNC-BL03] Effective APR Calculation:** For non-standard structures (e.g., Factor Rates, Fee-heavy loans), the system SHALL calculate and display the **True Effective APR**.

#### 3.2.3 Amortization & Analytics
* **[REQ-FUNC-AN01] Schedule Generation:** For any valid input set, the system SHALL generate a full amortization table containing:
  * Period Number / Date
  * Payment Amount
  * Principal Portion
  * Interest Portion
  * Total Fees
  * Remaining Balance
* **[REQ-FUNC-AN02] Visual Charts:** The SPA SHALL render real-time charts showing:
  * Cumulative Principal vs. Cumulative Interest over time.
  * Payment Breakdown pie/donut chart.

#### 3.2.4 Storage & Comparison Engine (PostgreSQL Integration)
* **[REQ-FUNC-DB01] Save Calculation:** Users SHALL be able to save their calculation parameters and results into the PostgreSQL database via Next.js API Routes / Server Actions.
* **[REQ-FUNC-DB02] Comparison Matrix:** The UI SHALL allow users to select up to 3 saved calculations and display them side-by-side in a comparison modal/panel.
* **[REQ-FUNC-DB03] Export Features:** The system SHALL generate downloadable **CSV** and **PDF** summary reports directly from the SPA state.

---

### 3.3 Logical Database Requirements (PostgreSQL Schema)

```sql
-- Schema Overview

CREATE TABLE loan_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(20) NOT NULL, -- 'PERSONAL' or 'BUSINESS'
    type_code VARCHAR(50) NOT NULL, -- 'FIXED_INSTALLMENT', 'MCA', 'EQUIPMENT', etc.
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE saved_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    loan_type VARCHAR(50) NOT NULL,
    inputs JSONB NOT NULL, -- Full parameter dump (principal, rate, term, fees, etc.)
    summary_results JSONB NOT NULL, -- (total_interest, monthly_payment, effective_apr)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_calculations_created ON saved_calculations(created_at DESC);
```

---

### 3.4 Non-Functional Requirements

#### 3.4.1 Performance & Responsiveness
* **[REQ-NFR-PERF1] Client-side Calculation:** Local recalculations on parameter adjustment MUST complete in **< 50 milliseconds**.
* **[REQ-NFR-PERF2] Page Load Time:** Initial First Contentful Paint (FCP) MUST occur within **< 1.2 seconds** on standard broadband.

#### 3.4.2 Type Safety & Code Quality
* **[REQ-NFR-CODE1] Strict TypeScript:** The codebase MUST have `strict: true` enabled in `tsconfig.json` without `any` overrides.
* **[REQ-NFR-CODE2] Zod Validation:** All API endpoints and client form inputs MUST be validated using **Zod** schemas.

#### 3.4.3 Security
* **[REQ-NFR-SEC1] Input Sanitization:** All raw text fields (e.g., calculation title) MUST be sanitized to prevent XSS and SQL Injection via ORM parameterized queries.
* **[REQ-NFR-SEC2] CORS & Rate Limiting:** API routes MUST enforce rate limiting (e.g., max 60 requests per minute per IP for persistence actions).

---

### 3.5 Infrastructure & Deployment (Docker Specification)

#### 3.5.1 Container Setup
The application MUST be deployable via a single `docker-compose up` command utilizing a multi-stage Dockerfile for Next.js.

```yaml
# docker-compose.yml specification overview
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: loancalc_db
    environment:
      POSTGRES_DB: loancalc
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secret_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: loancalc_app
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: "postgresql://postgres:secret_password@postgres:5432/loancalc?schema=public"
      NODE_ENV: "production"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
```

#### 3.5.2 Multi-Stage Dockerfile Strategy
1. **Stage 1 (deps):** Install `node_modules` based on `package.json` / `package-lock.json`.
2. **Stage 2 (builder):** Compile Next.js build assets & run Prisma/Drizzle generate scripts.
3. **Stage 3 (runner):** Create a minimal standalone Node environment using non-root user execution (`USER node`).

---

## 4. Verification & Testing Matrix

| Requirement ID | Verification Method | Test Case / Criteria |
| :--- | :--- | :--- |
| **REQ-FUNC-PL01** | Unit Test | Verify mathematical accuracy of fixed vs. interest-only payment formulas against standard financial tables. |
| **REQ-FUNC-BL03** | Unit Test | Input an MCA with factor rate 1.25 over 6 months; verify Effective APR matches standard IRR calculation. |
| **REQ-FUNC-DB01** | Integration Test | POST a calculation payload to `/api/calculations`; verify entry in PostgreSQL table `saved_calculations`. |
| **REQ-NFR-PERF1** | E2E Benchmark | Measure React re-render time upon dragging the interest rate slider using Chrome Lighthouse / DevTools. |
| **REQ-INT-002** | Systems Test | Execute `docker compose up --build` on a clean machine; ensure app and DB start and connect seamlessly. |

---