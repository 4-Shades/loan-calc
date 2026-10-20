import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// BDD acceptance tests: the .feature files are the source of truth (tdd_design.md §7).
// Scenarios without step definitions yet are skipped rather than failing generation;
// each slice adds steps and turns its scenarios green.
const testDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: "tests/e2e/steps/**/*.ts",
  missingSteps: "skip-scenario",
});

const PORT = 3000;

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Run against the production build, as the Next.js testing guide recommends.
    command: "npm run build && npm run start",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
