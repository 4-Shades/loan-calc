import { describe, expect, it, vi } from "vitest";
import { createRedisRateLimiter } from "@/lib/redisRateLimit";
import { rateLimitStoreFromEnv } from "@/lib/rateLimitConfig";

describe("rateLimitStoreFromEnv (D16)", () => {
  it("uses memory when no Redis is configured (Docker, tests)", () => {
    expect(rateLimitStoreFromEnv({})).toEqual({ kind: "memory" });
  });

  it("uses Upstash Redis when its REST credentials are present", () => {
    expect(rateLimitStoreFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({
      kind: "redis",
      url: "https://x.upstash.io",
      token: "t",
    });
  });

  it("accepts the KV_REST_API_* names from the Vercel Marketplace", () => {
    expect(rateLimitStoreFromEnv({ KV_REST_API_URL: "https://kv.upstash.io", KV_REST_API_TOKEN: "k" })).toEqual({
      kind: "redis",
      url: "https://kv.upstash.io",
      token: "k",
    });
  });

  it("can be forced to memory", () => {
    expect(
      rateLimitStoreFromEnv({ RATE_LIMIT_STORE: "memory", UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" }),
    ).toEqual({ kind: "memory" });
  });

  it("refuses RATE_LIMIT_STORE=redis without credentials", () => {
    expect(() => rateLimitStoreFromEnv({ RATE_LIMIT_STORE: "redis" })).toThrow(/UPSTASH_REDIS_REST_URL/);
  });

  it("rejects an unknown store", () => {
    expect(() => rateLimitStoreFromEnv({ RATE_LIMIT_STORE: "memcached" })).toThrow(/RATE_LIMIT_STORE/);
  });
});

describe("createRedisRateLimiter when Redis is unavailable", () => {
  it("lets the request through and reports the error (fail open)", async () => {
    const onError = vi.fn();
    const failing = { eval: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) };
    const limiter = createRedisRateLimiter({ redis: failing, prefix: "t", limit: 1, windowMs: 60_000, onError });
    expect(await limiter.check("ip")).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "ECONNREFUSED" }));
  });
});
