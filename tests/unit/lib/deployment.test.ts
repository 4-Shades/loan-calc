import { describe, expect, it } from "vitest";
import { nextOutput, poolConfig } from "@/lib/deployment";
import { migrationUrl, missingDeployEnv } from "@/lib/deployEnv";

// Neon connection strings as the Vercel integration injects them (D15).
const NEON_POOLED = "postgresql://app:secret@ep-quiet-sky-a1b2c3d4-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
const NEON_DIRECT = "postgresql://app:secret@ep-quiet-sky-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=require";

describe("nextOutput (Slice 9, D14)", () => {
  it("builds the standalone server for Docker", () => {
    expect(nextOutput({})).toBe("standalone");
  });

  it("lets Vercel use its own build output", () => {
    expect(nextOutput({ VERCEL: "1" })).toBeUndefined();
  });
});

describe("poolConfig (REQ-INT-001 on Docker and Vercel)", () => {
  it("uses a 10-connection pool for the long-running Docker server", () => {
    expect(poolConfig({ url: "postgresql://app@postgres:5432/loancalc", env: { NODE_ENV: "production" } })).toEqual({
      connectionString: "postgresql://app@postgres:5432/loancalc",
      ssl: false,
      max: 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  });

  it("uses a small pool on Vercel functions, over verified TLS, and waits for a waking Neon compute", () => {
    expect(poolConfig({ url: NEON_POOLED, env: { NODE_ENV: "production", VERCEL: "1" } })).toEqual({
      connectionString: NEON_POOLED,
      ssl: { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 15_000,
    });
  });

  it("honours DATABASE_POOL_MAX", () => {
    expect(poolConfig({ url: NEON_POOLED, env: { VERCEL: "1", DATABASE_POOL_MAX: "3" } }).max).toBe(3);
  });

  it.each(["0", "-1", "2.5", "lots"])("rejects DATABASE_POOL_MAX=%s", (value) => {
    expect(() => poolConfig({ url: NEON_POOLED, env: { DATABASE_POOL_MAX: value } })).toThrow(/DATABASE_POOL_MAX/);
  });
});

describe("migrationUrl (prisma.config.ts, D17)", () => {
  it("prefers an explicit DIRECT_URL", () => {
    expect(migrationUrl({ DIRECT_URL: NEON_DIRECT, DATABASE_URL_UNPOOLED: "other", DATABASE_URL: NEON_POOLED })).toBe(NEON_DIRECT);
  });

  it("uses the unpooled URL the Neon integration injects", () => {
    expect(migrationUrl({ DATABASE_URL_UNPOOLED: NEON_DIRECT, DATABASE_URL: NEON_POOLED })).toBe(NEON_DIRECT);
  });

  it("falls back to DATABASE_URL for Docker and local development, where there is no pooler", () => {
    expect(migrationUrl({ DATABASE_URL: "postgresql://postgres@localhost:55432/loancalc" })).toBe(
      "postgresql://postgres@localhost:55432/loancalc",
    );
  });

  it("is undefined when nothing is configured", () => {
    expect(migrationUrl({})).toBeUndefined();
  });
});

describe("missingDeployEnv (vercel-build guard)", () => {
  const complete = {
    DATABASE_URL: NEON_POOLED,
    DATABASE_URL_UNPOOLED: NEON_DIRECT,
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token",
  };

  it("accepts the variables the Neon and Upstash integrations inject", () => {
    expect(missingDeployEnv(complete)).toEqual([]);
  });

  it("accepts DIRECT_URL instead of DATABASE_URL_UNPOOLED", () => {
    expect(missingDeployEnv({ ...complete, DATABASE_URL_UNPOOLED: undefined, DIRECT_URL: NEON_DIRECT })).toEqual([]);
  });

  it("accepts the KV_REST_API_* names the Vercel Marketplace injects for Upstash", () => {
    expect(
      missingDeployEnv({
        ...complete,
        UPSTASH_REDIS_REST_URL: undefined,
        UPSTASH_REDIS_REST_TOKEN: undefined,
        KV_REST_API_URL: "https://example.upstash.io",
        KV_REST_API_TOKEN: "token",
      }),
    ).toEqual([]);
  });

  it("lists everything that is missing", () => {
    expect(missingDeployEnv({})).toEqual([
      "DATABASE_URL",
      "DATABASE_URL_UNPOOLED / DIRECT_URL (migrations must not fall back to the pooled URL)",
      "UPSTASH_REDIS_REST_URL / KV_REST_API_URL",
      "UPSTASH_REDIS_REST_TOKEN / KV_REST_API_TOKEN",
    ]);
  });

  it("requires a direct URL even when DATABASE_URL is set", () => {
    expect(missingDeployEnv({ ...complete, DATABASE_URL_UNPOOLED: undefined })).toEqual([
      "DATABASE_URL_UNPOOLED / DIRECT_URL (migrations must not fall back to the pooled URL)",
    ]);
  });

  it("rejects a direct URL that points at Neon's pooler", () => {
    expect(missingDeployEnv({ ...complete, DATABASE_URL_UNPOOLED: NEON_POOLED })).toEqual([
      "DATABASE_URL_UNPOOLED / DIRECT_URL must be the unpooled connection (its host must not contain -pooler)",
    ]);
  });
});
