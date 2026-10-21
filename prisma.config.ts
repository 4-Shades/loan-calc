// Prisma CLI configuration (migrations, studio). Loads .env for local use.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations go straight to the database, never through a pooler: DIRECT_URL
    // on Vercel (Prisma Postgres' db.prisma.io host), DATABASE_URL on Docker/local.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
