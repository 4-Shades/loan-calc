import { describe, expect, it } from "vitest";
import { nextOutput, poolConfig } from "@/lib/deployment";
import { missingDeployEnv } from "@/lib/deployEnv";

const PRISMA_POOLED = "postgres://user:secret@pooled.db.prisma.io:5432/postgres?sslmode=require";
const PRISMA_DIRECT = "postgres://user:secret@db.prisma.io:5432/postgres?sslmode=require";

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
    });
  });

  it("uses a small pool with a short idle timeout on Vercel functions, over verified TLS", () => {
    expect(poolConfig({ url: PRISMA_POOLED, env: { NODE_ENV: "production", VERCEL: "1" } })).toEqual({
      connectionString: PRISMA_POOLED,
      ssl: { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 5_000,
    });
  });

  it("honours DATABASE_POOL_MAX", () => {
    expect(poolConfig({ url: PRISMA_POOLED, env: { VERCEL: "1", DATABASE_POOL_MAX: "3" } }).max).toBe(3);
  });

  it.each(["0", "-1", "2.5", "lots"])("rejects DATABASE_POOL_MAX=%s", (value) => {
    expect(() => poolConfig({ url: PRISMA_POOLED, env: { DATABASE_POOL_MAX: value } })).toThrow(/DATABASE_POOL_MAX/);
  });
});

describe("missingDeployEnv (vercel-build guard)", () => {
  const complete = {
    DATABASE_URL: PRISMA_POOLED,
    DIRECT_URL: PRISMA_DIRECT,
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token",
  };

  it("accepts a complete configuration", () => {
    expect(missingDeployEnv(complete)).toEqual([]);
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
      "DIRECT_URL (migrations must not fall back to the pooled URL)",
      "UPSTASH_REDIS_REST_URL / KV_REST_API_URL",
      "UPSTASH_REDIS_REST_TOKEN / KV_REST_API_TOKEN",
    ]);
  });

  it("requires DIRECT_URL even when DATABASE_URL is set", () => {
    expect(missingDeployEnv({ ...complete, DIRECT_URL: undefined })).toEqual(["DIRECT_URL (migrations must not fall back to the pooled URL)"]);
  });
});
