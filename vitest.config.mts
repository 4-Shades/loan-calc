import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/app/layout.tsx"],
      // Gates from tdd_design.md §1.1 / §10.
      thresholds: {
        lines: 80,
        "src/engine/**": { lines: 90 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // Property tests run thousands of schedules; leave headroom when files run in parallel.
          testTimeout: 20_000,
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["tests/component/**/*.test.tsx"],
          setupFiles: ["tests/setup/component.ts"],
        },
      },
      {
        extends: true,
        test: {
          // Real PostgreSQL via Testcontainers: needs Docker (npm run test:integration).
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          // Timing budgets: run alone (npm run test:perf) so parallel suites don't skew them.
          name: "perf",
          environment: "node",
          include: ["tests/perf/**/*.test.ts"],
        },
      },
    ],
  },
});
