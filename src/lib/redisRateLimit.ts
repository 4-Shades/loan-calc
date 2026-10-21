import { retryAfter, type RateLimiter, type RateLimiterOptions, type RateLimitResult } from "./rateLimit";

/** The one Upstash client method the limiter needs (keeps it easy to fake in tests). */
export interface RedisEval {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}

interface RedisRateLimiterOptions extends RateLimiterOptions {
  redis: RedisEval;
  /** Key namespace, e.g. "loancalc:rl:client". */
  prefix: string;
  /** Called when Redis fails; the request is then allowed (fail open). */
  onError?: (error: Error) => void;
}

/**
 * Sliding-window log in a sorted set, checked and updated atomically in one
 * round trip so concurrent function instances can't race past the limit.
 * Same semantics as the memory store: entries older than the window are
 * dropped, rejected requests are not recorded, Retry-After counts down to the
 * oldest entry's expiry. Returns {1, remaining} or {0, oldestTimestamp}.
 */
const SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, tonumber(oldest[2])}
end
redis.call('ZADD', key, now, ARGV[4])
redis.call('PEXPIRE', key, window)
return {1, limit - count - 1}
`;

/**
 * Rate limiter backed by Upstash Redis (D16), shared by every Vercel function
 * instance. If Redis is unreachable the request is allowed and the error
 * reported: saving a calculation shouldn't fail because the limiter is down.
 */
export function createRedisRateLimiter({
  redis,
  prefix,
  limit,
  windowMs,
  now = Date.now,
  onError = (error) => console.error("Rate limiter unavailable; allowing request", error),
}: RedisRateLimiterOptions): RateLimiter {
  return {
    async check(key: string): Promise<RateLimitResult> {
      const time = now();
      try {
        const member = `${time}-${crypto.randomUUID()}`;
        const reply = await redis.eval(SLIDING_WINDOW, [`${prefix}:${key}`], [time, windowMs, limit, member]);
        const [allowed, value] = (reply as [number, number]).map(Number) as [number, number];
        return allowed === 1
          ? { allowed: true, remaining: value, retryAfterSeconds: 0 }
          : { allowed: false, remaining: 0, retryAfterSeconds: retryAfter(value, windowMs, time) };
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
        return { allowed: true, remaining: 0, retryAfterSeconds: 0 };
      }
    },
  };
}
