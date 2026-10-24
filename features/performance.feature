# Language: en
# Source: gherkin_bdd_feature_specs.md (SRS v1.1.0, LoanCalc-SPA)

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
