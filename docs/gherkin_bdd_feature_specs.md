# Language: en
# Feature: Multi-Type Loan & Amortization Engine Specifications
# Based on SRS Document Version 1.1.0 (LoanCalc-SPA)

@calculator @personal_loans
Feature: Personal Loan Amortization Calculations
  As a retail consumer
  I want to calculate dynamic amortization schedules for various personal loan structures
  So that I can evaluate monthly commitments, interest breakdowns, and payoff acceleration strategies.

  Background:
    Given the user is on the Loan Analytics SPA dashboard
    And the calculation mode is set to "Personal Loan"

  @REQ-FUNC-PL01 @REQ-FUNC-PL02
  Scenario Outline: Compute standard fixed-rate personal installment loan
    Given the user inputs a loan principal of $<principal>
    And an Annual Percentage Rate (APR) of <apr>%
    And a loan term of <term_months> months
    And a payment frequency of "<frequency>"
    When the system executes the calculation engine
    Then the calculated periodic payment should be approximately $<expected_payment>
    And the total interest paid over the life of the loan should be approximately $<expected_total_interest>
    And the amortization schedule should contain exactly <expected_periods> payment periods

    Examples:
      | principal | apr   | term_months | frequency | expected_payment | expected_total_interest | expected_periods |
      | 10000     | 5.00  | 24          | Monthly   | 438.71           | 529.15                  | 24               |
      | 25000     | 8.50  | 60          | Monthly   | 512.91           | 5774.86                 | 60               |
      | 5000      | 12.00 | 12          | Monthly   | 444.24           | 330.93                  | 12               |

  @REQ-FUNC-PL03
  Scenario: Acceleration of loan payoff via recurring extra payments
    Given a fixed personal loan with principal $20,000, APR 6.00%, and 48 months term
    When the user adds a recurring extra payment of $100.00 per month
    Then the engine calculates a term reduction of at least 7 months
    And the computed total interest savings should exceed $400.00
    And the interactive amortization schedule updates instantly without page reload

  @REQ-FUNC-PL01
  Scenario: Revolving line of credit minimum payment calculation
    Given the user selects loan type "Revolving Line of Credit"
    And inputs an outstanding balance of $8,000
    And an APR of 18.00%
    And a minimum payment rule of 2.50% of outstanding balance
    When the calculation engine executes
    Then the initial monthly minimum payment should be calculated as $200.00
    And the breakdown should reflect $120.00 toward interest and $80.00 toward principal reduction


@calculator @business_loans
Feature: Business Loan Engine & Effective APR Calculations
  As a business owner or financial analyst
  I want to model complex business financing structures including factor rates, fees, and grace periods
  So that I can assess effective APR and true borrowing costs on corporate cash flows.

  Background:
    Given the user is on the Loan Analytics SPA dashboard
    And the calculation mode is set to "Business Loan"

  @REQ-FUNC-BL01 @REQ-FUNC-BL03
  Scenario: Merchant Cash Advance (MCA) Factor Rate and Effective APR computation
    Given the user selects loan type "Merchant Cash Advance"
    And enters an advance amount of $50,000
    And inputs a Factor Rate of 1.25
    And specifies a payback term of 6 months with daily automatic withholdings
    When the engine calculates the advance repayment terms
    Then the total payback amount should equal $62,500.00
    And the calculated total fee/finance charge should equal $12,500.00
    And the calculated Effective APR should reflect the short-term annual cost exceeding 45.00%

  @REQ-FUNC-BL01 @REQ-FUNC-BL02
  Scenario: Term loan with interest-only grace period
    Given the user selects loan type "Interest-Only Grace Period Loan"
    And enters a principal amount of $100,000
    And an interest rate of 7.50% APR
    And a total loan term of 36 months
    And a Grace Period duration of 6 months
    When the amortization engine generates the payment schedule
    Then payments for periods 1 through 6 should contain $0 principal reduction
    And payments for periods 1 through 6 should require $625.00 monthly interest-only payments
    And payments from period 7 onward should amortize the full $100,000 principal over the remaining 30 months

  @REQ-FUNC-BL01
  Scenario: Equipment financing with down payment and residual value
    Given the user selects loan type "Equipment Financing"
    And specifies equipment purchase price of $150,000
    And a down payment of $30,000 (20%)
    And a residual value at term end of $15,000
    And an APR of 6.50% over 48 months
    When the engine calculates the financing schedule
    Then the financed principal base should equal $120,000
    And the final period balloon payment should account for the $15,000 residual value


@persistence @database
Feature: PostgreSQL Scenario Storage and Side-by-Side Comparison Matrix
  As an application user
  I want to save calculated loan configurations and display them in a side-by-side matrix
  So that I can evaluate competing lending offers and make informed financial decisions.

  @REQ-FUNC-DB01 @REQ-NFR-CODE2 @db-direct
  Scenario: Successfully save a loan calculation scenario to PostgreSQL
    Given a fully calculated loan schedule for "SBA 7(a) Expansion Loan"
    And valid payload parameters structured according to the Zod validation schema
    When the user submits the "Save Calculation" form with title "Option A - Local Bank SBA"
    Then Next.js issues a Server Action / REST POST request to "/api/calculations"
    And a JSON record is saved into the "saved_calculations" PostgreSQL table
    And the UI displays a success notification with the assigned UUID

  @REQ-FUNC-DB02 @db-direct
  Scenario: Display side-by-side comparison matrix for up to 3 saved scenarios
    Given the user has 3 saved calculations in PostgreSQL:
      | Title             | Category | Loan Amount | Effective APR | Monthly Payment | Total Interest |
      | Bank Term Loan    | Business | $100,000    | 7.20%         | $3,096.64       | $11,479.04     |
      | MCA Option        | Business | $100,000    | 42.50%        | $4,166.66       | $24,999.80     |
      | Equipment Lease   | Business | $100,000    | 6.10%         | $2,353.67       | $12,976.16     |
    When the user selects all 3 scenarios and opens the "Comparison Matrix"
    Then the UI renders a multi-column modal without reloading the page
    And highlights the lowest total interest option in green
    And highlights the lowest monthly payment option in blue

  @REQ-FUNC-DB03
  Scenario: Export loan schedule summary to CSV
    Given an active calculated loan schedule with 36 periods
    When the user clicks the "Export CSV" button
    Then a file named "loan-amortization-schedule.csv" is generated client-side
    And the header row contains "Period,Date,Payment,Principal,Interest,Fees,Remaining Balance"


@performance @spa
Feature: Single-Page Application Performance and System Constraints
  As a user interacting with dynamic inputs
  I want near-instantaneous mathematical updates and high responsiveness
  So that slider adjustments feel fluid and seamless.

  @REQ-UI-001 @REQ-NFR-PERF1
  Scenario: Real-time dynamic recalculation on UI slider adjustment
    Given the loan calculation panel is active
    When the user drags the APR input slider from 5.00% to 7.50%
    Then the client-side WebAssembly/TypeScript calculation engine re-evaluates the schedule
    And the total recalculation time and UI re-render completes in under 50 milliseconds
    And no full browser page reload is performed

  @REQ-NFR-SEC2
  Scenario: API Rate Limiting protection on persistence endpoints
    Given a client client IP address triggering continuous save requests
    When the client sends more than 60 POST requests to "/api/calculations" within 1 minute
    Then the server returns an HTTP 429 Too Many Requests response status
    And an error message indicating rate limit exceeded is returned in JSON format