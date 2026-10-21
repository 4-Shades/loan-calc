import { describe, expect, it } from "vitest";
import type { RateLimiter } from "@/lib/rateLimit";

export interface Clock {
  now: () => number;
  advance: (ms: number) => number;
}

export function clock(start = 1_000_000): Clock {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

type Factory = (options: { limit: number; windowMs: number; now: () => number }) => RateLimiter | Promise<RateLimiter>;

/**
 * REQ-NFR-SEC2 behaviour every rate-limit store must share (D16): the in-memory
 * store used on Docker and the Redis store used on Vercel run the same cases.
 * Each case uses fresh keys so stores with persistent state don't interfere.
 */
export function rateLimiterContract(storeName: string, create: Factory) {
  let run = 0;
  const key = (name: string) => `${storeName}-${Date.now()}-${++run}-${name}`;

  describe(`rate limiter contract: ${storeName}`, () => {
    it("allows 60 requests in a minute and rejects the 61st", async () => {
      const limiter = await create({ limit: 60, windowMs: 60_000, now: clock().now });
      const ip = key("ip");
      for (let i = 0; i < 60; i++) {
        expect((await limiter.check(ip)).allowed).toBe(true);
      }
      expect(await limiter.check(ip)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    });

    it("counts remaining requests", async () => {
      const limiter = await create({ limit: 3, windowMs: 60_000, now: clock().now });
      const ip = key("ip");
      expect((await limiter.check(ip)).remaining).toBe(2);
      expect((await limiter.check(ip)).remaining).toBe(1);
      expect((await limiter.check(ip)).remaining).toBe(0);
    });

    it("limits each key independently", async () => {
      const limiter = await create({ limit: 1, windowMs: 60_000, now: clock().now });
      const [a, b] = [key("a"), key("b")];
      expect((await limiter.check(a)).allowed).toBe(true);
      expect((await limiter.check(a)).allowed).toBe(false);
      expect((await limiter.check(b)).allowed).toBe(true);
    });

    it("uses a sliding window: capacity returns as old requests age out", async () => {
      const time = clock();
      const limiter = await create({ limit: 2, windowMs: 60_000, now: time.now });
      const ip = key("ip");
      await limiter.check(ip);
      time.advance(30_000);
      await limiter.check(ip);
      expect(await limiter.check(ip)).toMatchObject({ allowed: false, retryAfterSeconds: 30 });
      time.advance(30_000);
      expect((await limiter.check(ip)).allowed).toBe(true);
    });

    it("does not count rejected requests against the window", async () => {
      const time = clock();
      const limiter = await create({ limit: 1, windowMs: 60_000, now: time.now });
      const ip = key("ip");
      await limiter.check(ip);
      for (let i = 0; i < 20; i++) await limiter.check(ip);
      time.advance(60_000);
      expect((await limiter.check(ip)).allowed).toBe(true);
    });
  });
}
