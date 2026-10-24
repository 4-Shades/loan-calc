// SQL migration runner (replaces Prisma Migrate). Imports only node: modules and pg,
// so scripts/migrate.mjs can load this file directly with Node's type stripping.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export interface Migration {
  /** File name without .sql, e.g. "0001_init". Recorded in schema_migrations. */
  version: string;
  sql: string;
}

const FILE_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
/** Arbitrary constant: one migration run per database at a time. */
const LOCK_ID = 7_291_042;
/** The first migration, which databases created by Prisma Migrate already contain. */
const BASELINE = "0001_init";

/** Reads `NNNN_name.sql` files in version order; other files in the folder are ignored. */
export async function loadMigrations(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql") || /^\d/.test(file)).sort();
  const migrations: Migration[] = [];
  const numbers = new Set<string>();
  for (const file of files) {
    if (!FILE_NAME.test(file)) {
      throw new Error(`Migration "${file}" must be named NNNN_name.sql (lowercase, e.g. 0002_add_index.sql)`);
    }
    const number = file.slice(0, 4);
    if (numbers.has(number)) throw new Error(`Two migrations are numbered ${number}`);
    numbers.add(number);
    const sql = await readFile(path.join(dir, file), "utf8");
    if (sql.trim() === "") throw new Error(`Migration "${file}" is empty`);
    migrations.push({ version: file.slice(0, -".sql".length), sql });
  }
  return migrations;
}

interface RunOptions {
  connectionString: string;
  dir: string;
  log?: (message: string) => void;
}

/**
 * Applies pending migrations, each in its own transaction, under an advisory lock
 * so concurrent deploys can't race. A database that Prisma Migrate already set up
 * (it has the tables but no schema_migrations rows) gets the initial migration
 * recorded as applied instead of run again.
 */
export async function runMigrations({
  connectionString,
  dir,
  log = console.log,
}: RunOptions): Promise<{ applied: string[]; baselined: string[] }> {
  const migrations = await loadMigrations(dir);
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  const baselined: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set(
      (await client.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version),
    );

    if (done.size === 0) {
      const existing = await client.query<{ table: string | null }>("SELECT to_regclass('public.saved_calculations') AS table");
      if (existing.rows[0]?.table) {
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [BASELINE]);
        done.add(BASELINE);
        baselined.push(BASELINE);
        log(`Recorded ${BASELINE} as applied: the schema already exists (created by Prisma Migrate).`);
      }
    }

    for (const migration of migrations) {
      if (done.has(migration.version)) continue;
      log(`Applying ${migration.version}`);
      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migration.version]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${migration.version} failed and was rolled back: ${(error as Error).message}`, {
          cause: error,
        });
      }
      applied.push(migration.version);
    }
    if (applied.length === 0 && baselined.length === 0) log("Database is up to date.");
    return { applied, baselined };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    await client.end();
  }
}
