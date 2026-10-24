import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { runMigrations } from "@/lib/migrate";

/** The SQL migration runner that replaces Prisma Migrate, against a real PostgreSQL 16. */
const MIGRATIONS = "db/migrations";
const silent = () => {};

let container: StartedPostgreSqlContainer;
let admin: Client;
let databaseCount = 0;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  admin = new Client({ connectionString: container.getConnectionUri() });
  await admin.connect();
});

afterAll(async () => {
  await admin?.end();
  await container?.stop();
});

/** A fresh, empty database in the shared container. */
async function freshDatabase(): Promise<string> {
  const name = `migrate_${++databaseCount}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${name}`;
  return url.toString();
}

async function query<T>(connectionString: string, sql: string): Promise<T[]> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return (await client.query(sql)).rows as T[];
  } finally {
    await client.end();
  }
}

const tables = (url: string) =>
  query<{ table_name: string }>(
    url,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  ).then((rows) => rows.map((r) => r.table_name));

describe("runMigrations", () => {
  it("creates the SRS §3.3 schema on an empty database", async () => {
    const url = await freshDatabase();
    expect(await runMigrations({ connectionString: url, dir: MIGRATIONS, log: silent })).toEqual({
      applied: ["0001_init"],
      baselined: [],
    });
    expect(await tables(url)).toEqual(["loan_products", "saved_calculations", "schema_migrations"]);
    const indexes = await query<{ indexdef: string }>(
      url,
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_calculations_created'",
    );
    expect(indexes[0]?.indexdef).toMatch(/created_at DESC/);
  });

  it("is idempotent: a second run applies nothing", async () => {
    const url = await freshDatabase();
    await runMigrations({ connectionString: url, dir: MIGRATIONS, log: silent });
    expect(await runMigrations({ connectionString: url, dir: MIGRATIONS, log: silent })).toEqual({
      applied: [],
      baselined: [],
    });
  });

  it("adopts a database that Prisma Migrate already created, without re-running the initial migration", async () => {
    const url = await freshDatabase();
    // What Prisma Migrate left behind before Prisma was removed.
    await query(url, await readFile(path.join(MIGRATIONS, "0001_init.sql"), "utf8"));
    await query(url, "CREATE TABLE _prisma_migrations (id varchar(36) PRIMARY KEY)");
    await query(url, "INSERT INTO saved_calculations (title, loan_type, inputs, summary_results) VALUES ('kept', 'MCA', '{}', '{}')");

    expect(await runMigrations({ connectionString: url, dir: MIGRATIONS, log: silent })).toEqual({
      applied: [],
      baselined: ["0001_init"],
    });
    expect(await query<{ title: string }>(url, "SELECT title FROM saved_calculations")).toEqual([{ title: "kept" }]);
  });

  it("rolls back a failing migration completely and reports which file failed", async () => {
    const url = await freshDatabase();
    const dir = await mkdtemp(path.join(tmpdir(), "migrations-"));
    try {
      await writeFile(path.join(dir, "0001_init.sql"), await readFile(path.join(MIGRATIONS, "0001_init.sql"), "utf8"));
      await writeFile(path.join(dir, "0002_broken.sql"), "CREATE TABLE half_done (id int);\nSELECT * FROM no_such_table;");

      await expect(runMigrations({ connectionString: url, dir, log: silent })).rejects.toThrow(/0002_broken/);
      expect(await tables(url)).not.toContain("half_done");
      expect(await query<{ version: string }>(url, "SELECT version FROM schema_migrations ORDER BY version")).toEqual([
        { version: "0001_init" },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("is safe when two deploys migrate at the same time", async () => {
    const url = await freshDatabase();
    const results = await Promise.all([
      runMigrations({ connectionString: url, dir: MIGRATIONS, log: silent }),
      runMigrations({ connectionString: url, dir: MIGRATIONS, log: silent }),
    ]);
    expect(results.flatMap((r) => r.applied)).toEqual(["0001_init"]);
    expect(await query<{ n: string }>(url, "SELECT count(*) AS n FROM schema_migrations")).toEqual([{ n: "1" }]);
  });
});
