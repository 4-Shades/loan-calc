import { describe, expect, it } from "vitest";
import { clientIp, createMemoryRateLimiter } from "@/lib/rateLimit";
import { clock, rateLimiterContract } from "../../support/rateLimitContract";

// The shared REQ-NFR-SEC2 behaviour; the Redis store runs the same cases in tests/integration.
rateLimiterContract("memory", (options) => createMemoryRateLimiter(options));

describe("createMemoryRateLimiter", () => {
  it("forgets idle keys so memory stays bounded", async () => {
    const time = clock();
    const limiter = createMemoryRateLimiter({ limit: 5, windowMs: 60_000, now: time.now });
    for (let i = 0; i < 1_000; i++) await limiter.check(`ip-${i}`);
    expect(limiter.size()).toBe(1_000);
    time.advance(60_001);
    await limiter.check("fresh");
    expect(limiter.size()).toBe(1);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("on Vercel, prefers x-vercel-forwarded-for, which Vercel's edge sets and clients can't spoof", () => {
    const headers = new Headers({ "x-vercel-forwarded-for": "198.51.100.4", "x-forwarded-for": "203.0.113.7" });
    expect(clientIp(headers, { onVercel: true })).toBe("198.51.100.4");
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("on Vercel without that header, falls back to the overwritten x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.4" }), { onVercel: true })).toBe("198.51.100.4");
  });
});
