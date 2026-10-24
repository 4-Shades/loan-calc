import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { poolConfig } from "./deployment";

// One pool per process (or per Vercel function instance), surviving dev hot reloads.
const globalForDb = globalThis as unknown as { dbPool?: Pool };

/** The shared PostgreSQL pool, created on first use from DATABASE_URL (REQ-INT-001). */
export function getPool(): Pool {
  if (!globalForDb.dbPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const pool = new Pool(poolConfig({ url, env: process.env }));
    // An idle client can lose its connection (e.g. when Neon suspends); log it rather than crash.
    pool.on("error", (error) => console.error("Idle database connection failed", error));
    // On Vercel, release idle connections before a function instance is suspended.
    if (process.env.VERCEL) attachDatabasePool(pool);
    globalForDb.dbPool = pool;
  }
  return globalForDb.dbPool;
}

export async function closePool(): Promise<void> {
  await globalForDb.dbPool?.end();
  globalForDb.dbPool = undefined;
}
