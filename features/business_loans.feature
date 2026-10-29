# Language: en
# Source: docs/gherkin_bdd_feature_specs.md (SRS v1.1.0, LoanCalc-SPA)

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
