import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createRateLimiter (REQ-NFR-SEC2: 60 requests per minute per IP)", () => {
  it("allows 60 requests in a minute and rejects the 61st", () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 60, windowMs: 60_000, now: time.now });
    for (let i = 0; i < 60; i++) {
      expect(limiter.check("1.2.3.4").allowed).toBe(true);
    }
    expect(limiter.check("1.2.3.4")).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
  });

  it("counts remaining requests", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: clock().now });
    expect(limiter.check("a").remaining).toBe(2);
    expect(limiter.check("a").remaining).toBe(1);
    expect(limiter.check("a").remaining).toBe(0);
  });

  it("limits each key independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("uses a sliding window: capacity returns as old requests age out", () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: time.now });
    limiter.check("a");
    time.advance(30_000);
    limiter.check("a");
    expect(limiter.check("a")).toMatchObject({ allowed: false, retryAfterSeconds: 30 });
    time.advance(30_000);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("does not count rejected requests against the window", () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: time.now });
    limiter.check("a");
    for (let i = 0; i < 100; i++) limiter.check("a");
    time.advance(60_000);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("forgets idle keys so memory stays bounded", () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: time.now });
    for (let i = 0; i < 1_000; i++) limiter.check(`ip-${i}`);
    expect(limiter.size()).toBe(1_000);
    time.advance(60_001);
    limiter.check("fresh");
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
});
