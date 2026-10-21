// DATABASE_URL for the app under test and for steps that check the database.
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// BDD acceptance tests: the .feature files are the source of truth (tdd_design.md §7).
// Scenarios without step definitions yet are skipped rather than failing generation;
// each slice adds steps and turns its scenarios green.
const bddTestDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: "tests/e2e/steps/**/*.ts",
  missingSteps: "skip-scenario",
});

// Its own port, so a `next dev` server on 3000 is never mistaken for the build under test
// (dev-mode React is several times slower and would skew the REQ-NFR-PERF1 timings).
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    // Acceptance scenarios generated from features/*.feature.
    { name: "bdd", testDir: bddTestDir, use: { ...devices["Desktop Chrome"] } },
    // Cross-cutting checks with no Gherkin scenario: responsive layout, accessibility, security.
    { name: "specs", testDir: "tests/e2e/specs", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Run against the production build, as the Next.js testing guide recommends.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Always a fresh production server: never reuse whatever happens to be listening.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
