# Language: en
# Source: gherkin_bdd_feature_specs.md (SRS v1.0.0, LoanCalc-SPA)

@persistence @database
Feature: PostgreSQL Scenario Storage and Side-by-Side Comparison Matrix
  As an application user
  I want to save calculated loan configurations and display them in a side-by-side matrix
  So that I can evaluate competing lending offers and make informed financial decisions.

  @REQ-FUNC-DB01 @REQ-NFR-CODE2
  Scenario: Successfully save a loan calculation scenario to PostgreSQL
    Given a fully calculated loan schedule for "SBA 7(a) Expansion Loan"
    And valid payload parameters structured according to the Zod validation schema
    When the user submits the "Save Calculation" form with title "Option A - Local Bank SBA"
    Then Next.js issues a Server Action / REST POST request to "/api/calculations"
    And a JSON record is saved into the "saved_calculations" PostgreSQL table
    And the UI displays a success notification with the assigned UUID

  @REQ-FUNC-DB02
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
