// Applies db/migrations to the database (replaces `prisma migrate deploy`).
// Uses the direct connection: DIRECT_URL, Neon's DATABASE_URL_UNPOOLED, or DATABASE_URL
// on Docker/local. Loads .env when present for local use.
import { existsSync } from "node:fs";
import { migrationUrl } from "../src/lib/deployEnv.ts";
import { runMigrations } from "../src/lib/migrate.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const connectionString = migrationUrl(process.env);
if (!connectionString) {
  console.error("No database URL: set DATABASE_URL (or DIRECT_URL / DATABASE_URL_UNPOOLED).");
  process.exit(1);
}

try {
  await runMigrations({ connectionString, dir: "db/migrations" });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
