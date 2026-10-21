// Kept free of imports so scripts/vercel-build.mjs can load it with Node's type stripping.

type Env = Record<string, string | undefined>;

/**
 * Environment variables a Vercel deployment needs before it may migrate and build
 * (Slice 9): the pooled database URL for the app, an explicit direct URL for
 * migrations (never the pooled one), and Upstash credentials for rate limiting.
 * Returns what is missing, empty when complete.
 */
export function missingDeployEnv(env: Env): string[] {
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!env.DIRECT_URL) missing.push("DIRECT_URL (migrations must not fall back to the pooled URL)");
  if (!(env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)) missing.push("UPSTASH_REDIS_REST_URL / KV_REST_API_URL");
  if (!(env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)) {
    missing.push("UPSTASH_REDIS_REST_TOKEN / KV_REST_API_TOKEN");
  }
  return missing;
}
