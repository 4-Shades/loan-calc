import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { poolConfig } from "./deployment";

// One pool and client per process (or per Vercel function instance), surviving dev hot reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pool?: Pool };

/** The shared Prisma client, created on first use from DATABASE_URL (REQ-INT-001). */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const pool = new Pool(poolConfig({ url, env: process.env }));
    // On Vercel, release idle connections before a function instance is suspended.
    if (process.env.VERCEL) attachDatabasePool(pool);
    globalForPrisma.pool = pool;
    globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  return globalForPrisma.prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await globalForPrisma.prisma?.$disconnect();
  await globalForPrisma.pool?.end();
  globalForPrisma.prisma = undefined;
  globalForPrisma.pool = undefined;
}
