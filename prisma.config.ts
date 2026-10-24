// Prisma CLI configuration (migrations, studio). Loads .env for local use.
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { migrationUrl } from "./src/lib/deployEnv";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations go straight to the database, never through Neon's pooler:
    // DIRECT_URL or DATABASE_URL_UNPOOLED on Vercel, DATABASE_URL on Docker/local.
    url: migrationUrl(process.env),
  },
});
