// Kept free of imports so scripts/vercel-build.mjs and prisma.config.ts can load it directly.

type Env = Record<string, string | undefined>;

/** The direct (unpooled) database URL: DIRECT_URL, or DATABASE_URL_UNPOOLED as the Neon integration injects it. */
function directUrl(env: Env): string | undefined {
  return env.DIRECT_URL || env.DATABASE_URL_UNPOOLED || undefined;
}

/**
 * URL for Prisma migrations (D17): always the direct connection when there is
 * one, because Neon's pooled connection (PgBouncer) can't run migrations. Docker
 * and local PostgreSQL have no pooler, so DATABASE_URL is used there.
 */
export function migrationUrl(env: Env): string | undefined {
  return directUrl(env) ?? (env.DATABASE_URL || undefined);
}

const DIRECT = "DATABASE_URL_UNPOOLED / DIRECT_URL";

/**
 * Environment variables a Vercel deployment needs before it may migrate and build
 * (Slice 9): Neon's pooled URL for the app, its direct URL for migrations (never
 * the pooled one), and Upstash credentials for rate limiting. Returns what is
 * missing or wrong, empty when complete.
 */
export function missingDeployEnv(env: Env): string[] {
  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push("DATABASE_URL");

  const direct = directUrl(env);
  if (!direct) {
    problems.push(`${DIRECT} (migrations must not fall back to the pooled URL)`);
  } else if (isPooled(direct)) {
    problems.push(`${DIRECT} must be the unpooled connection (its host must not contain -pooler)`);
  }

  if (!(env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)) problems.push("UPSTASH_REDIS_REST_URL / KV_REST_API_URL");
  if (!(env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)) {
    problems.push("UPSTASH_REDIS_REST_TOKEN / KV_REST_API_TOKEN");
  }
  return problems;
}

/** Neon marks pooled endpoints with "-pooler" in the host name. */
function isPooled(url: string): boolean {
  try {
    return new URL(url).hostname.includes("-pooler");
  } catch {
    return false;
  }
}
