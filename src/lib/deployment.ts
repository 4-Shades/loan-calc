import { databaseSsl, type SslSetting } from "./dbConfig";

type Env = Record<string, string | undefined>;

/**
 * Next.js output mode (D14): the self-contained standalone server for the Docker
 * image; on Vercel, Vercel's own build output (Vercel sets VERCEL=1 during builds).
 */
export function nextOutput(env: Env): "standalone" | undefined {
  return env.VERCEL ? undefined : "standalone";
}

export interface PoolConfig {
  connectionString: string;
  ssl: SslSetting;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

/**
 * node-postgres pool settings (REQ-INT-001). The Docker server is one long-lived
 * process with a 10-connection pool. Each Vercel function instance keeps a small
 * pool with a short idle timeout, on the pooled connection string, so many
 * instances don't exhaust the database (Vercel advises against a pool of 1).
 * Connecting may wait up to 15 s on Vercel, because an idle Neon compute is
 * suspended and has to start before it accepts the first connection.
 */
export function poolConfig({ url, env }: { url: string; env: Env }): PoolConfig {
  const onVercel = Boolean(env.VERCEL);
  const max = env.DATABASE_POOL_MAX === undefined ? (onVercel ? 5 : 10) : Number(env.DATABASE_POOL_MAX);
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`DATABASE_POOL_MAX must be a positive whole number, got "${env.DATABASE_POOL_MAX}"`);
  }
  return {
    connectionString: url,
    ssl: databaseSsl({ url, nodeEnv: env.NODE_ENV, override: env.DATABASE_SSL }),
    max,
    idleTimeoutMillis: onVercel ? 5_000 : 10_000,
    connectionTimeoutMillis: onVercel ? 15_000 : 5_000,
  };
}
