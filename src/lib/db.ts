import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseSsl } from "./dbConfig";

// One client (and so one connection pool) per process, surviving dev hot reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** The shared Prisma client, created on first use from DATABASE_URL (REQ-INT-001). */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const adapter = new PrismaPg({
      connectionString: url,
      ssl: databaseSsl({ url, nodeEnv: process.env.NODE_ENV, override: process.env.DATABASE_SSL }),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = undefined;
}
