export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until another request would be allowed; 0 when allowed. */
  retryAfterSeconds: number;
}

/** A sliding-window limiter (REQ-NFR-SEC2). Stores: memory (Docker) or Redis (Vercel, D16). */
export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

/**
 * In-memory sliding-window limiter. State lives in this process only: right for
 * the single Docker container, wrong for serverless functions, where each instance
 * would count separately (use the Redis store there). Rejected requests are not
 * recorded, so a blocked client recovers on schedule.
 */
export function createMemoryRateLimiter({ limit, windowMs, now = Date.now }: RateLimiterOptions) {
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  /** Drops keys with no requests inside the window, at most once per window. */
  function sweep(time: number) {
    if (time - lastSweep < windowMs) return;
    lastSweep = time;
    for (const [key, times] of hits) {
      if (times[times.length - 1]! <= time - windowMs) hits.delete(key);
    }
  }

  return {
    async check(key: string): Promise<RateLimitResult> {
      const time = now();
      sweep(time);
      const recent = (hits.get(key) ?? []).filter((t) => t > time - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter(recent[0]!, windowMs, time) };
      }
      recent.push(time);
      hits.set(key, recent);
      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },
    /** Number of tracked keys (for tests and monitoring). */
    size: () => hits.size,
  };
}

/** Whole seconds until the oldest request in the window expires (at least 1). */
export function retryAfter(oldestMs: number, windowMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((oldestMs + windowMs - nowMs) / 1000));
}

/**
 * Best-effort client IP.
 *
 * - On Vercel, the edge overwrites x-forwarded-for, x-real-ip and
 *   x-vercel-forwarded-for with the real client address, so they can be trusted;
 *   x-vercel-forwarded-for is preferred because another proxy in front could
 *   rewrite x-forwarded-for.
 * - Elsewhere, Next.js fills x-forwarded-for from the socket only when the client
 *   didn't send one, so without a reverse proxy that overwrites it, clients choose
 *   their own key. The API's global cap still holds in that case.
 */
export function clientIp(headers: Headers, { onVercel = false }: { onVercel?: boolean } = {}): string {
  const first = (name: string) => headers.get(name)?.split(",")[0]?.trim();
  return (onVercel && first("x-vercel-forwarded-for")) || first("x-forwarded-for") || headers.get("x-real-ip")?.trim() || "unknown";
}
