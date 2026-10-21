export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until another request would be allowed; 0 when allowed. */
  retryAfterSeconds: number;
}

interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

/**
 * In-memory sliding-window rate limiter (REQ-NFR-SEC2). State lives in this
 * process only: right for the single-container deployment, but replicas would
 * each keep their own count (use a shared store such as Redis to scale out).
 * Rejected requests are not recorded, so a blocked client recovers on schedule.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }: RateLimiterOptions) {
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
    check(key: string): RateLimitResult {
      const time = now();
      sweep(time);
      const recent = (hits.get(key) ?? []).filter((t) => t > time - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const retryAfterSeconds = Math.max(1, Math.ceil((recent[0]! + windowMs - time) / 1000));
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }
      recent.push(time);
      hits.set(key, recent);
      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },
    /** Number of tracked keys (for tests and monitoring). */
    size: () => hits.size,
  };
}

/**
 * Best-effort client IP. Next.js fills x-forwarded-for from the socket only when
 * the client didn't send one, so without a reverse proxy that overwrites it,
 * clients can choose their own key. Deploy behind such a proxy in production;
 * the API also applies a global cap that spoofed IPs cannot escape.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
