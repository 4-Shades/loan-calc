# Language: en
# Source: docs/gherkin_bdd_feature_specs.md (SRS v1.1.0, LoanCalc-SPA)

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
