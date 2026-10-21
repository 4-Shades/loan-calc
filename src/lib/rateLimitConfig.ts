import { Redis } from "@upstash/redis";
import { createMemoryRateLimiter, type RateLimiter } from "./rateLimit";
import { createRedisRateLimiter } from "./redisRateLimit";

type Env = Record<string, string | undefined>;

export type RateLimitStore = { kind: "memory" } | { kind: "redis"; url: string; token: string };

/**
 * Which store holds rate-limit counts (D16). Redis when Upstash REST credentials
 * are present (UPSTASH_REDIS_REST_* or the KV_REST_API_* names the Vercel
 * Marketplace injects), otherwise memory. RATE_LIMIT_STORE=memory|redis overrides.
 */
export function rateLimitStoreFromEnv(env: Env): RateLimitStore {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const requested = env.RATE_LIMIT_STORE?.toLowerCase();

  if (requested && requested !== "memory" && requested !== "redis") {
    throw new Error(`RATE_LIMIT_STORE must be "memory" or "redis", got "${env.RATE_LIMIT_STORE}"`);
  }
  if (requested === "memory") return { kind: "memory" };
  if (url && token) return { kind: "redis", url, token };
  if (requested === "redis") {
    throw new Error("RATE_LIMIT_STORE=redis needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*)");
  }
  return { kind: "memory" };
}

/** A limiter for one namespace, in whichever store the environment selects. */
export function createRateLimiter(
  store: RateLimitStore,
  options: { name: string; limit: number; windowMs: number },
): RateLimiter {
  if (store.kind === "memory") return createMemoryRateLimiter(options);
  return createRedisRateLimiter({
    redis: new Redis({ url: store.url, token: store.token }),
    prefix: `loancalc:rl:${options.name}`,
    limit: options.limit,
    windowMs: options.windowMs,
  });
}
