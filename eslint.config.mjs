import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // REQ-NFR-CODE1: no `any` overrides.
      "@typescript-eslint/no-explicit-any": "error",
      // REQ-NFR-SEC1: React's escaping is the main XSS defence; never bypass it.
      "react/no-danger": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test artifacts:
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".features-gen/**",
  ]),
]);

export default eslintConfig;
