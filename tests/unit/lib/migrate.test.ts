import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMigrations } from "@/lib/migrate";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "migrations-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadMigrations", () => {
  it("reads NNNN_name.sql files in version order and ignores other files", async () => {
    await writeFile(path.join(dir, "0002_add_index.sql"), "CREATE INDEX x ON t (c);");
    await writeFile(path.join(dir, "0001_init.sql"), "CREATE TABLE t (c int);");
    await writeFile(path.join(dir, "README.md"), "notes");
    expect(await loadMigrations(dir)).toEqual([
      { version: "0001_init", sql: "CREATE TABLE t (c int);" },
      { version: "0002_add_index", sql: "CREATE INDEX x ON t (c);" },
    ]);
  });

  it("ships the initial migration matching SRS §3.3", async () => {
    const [init] = await loadMigrations("db/migrations");
    expect(init?.version).toBe("0001_init");
    expect(init?.sql).toContain('CREATE TABLE "saved_calculations"');
    expect(init?.sql).toContain('CREATE TABLE "loan_products"');
    expect(init?.sql).toContain('"created_at" DESC');
  });

  it.each(["1_init.sql", "0001-init.sql", "0001_Init.sql", "init.sql"])("rejects the badly named file %s", async (name) => {
    await writeFile(path.join(dir, name), "SELECT 1;");
    await expect(loadMigrations(dir)).rejects.toThrow(/NNNN_name\.sql/);
  });

  it("rejects two migrations with the same number", async () => {
    await writeFile(path.join(dir, "0001_a.sql"), "SELECT 1;");
    await writeFile(path.join(dir, "0001_b.sql"), "SELECT 1;");
    await expect(loadMigrations(dir)).rejects.toThrow(/0001/);
  });

  it("rejects an empty migration", async () => {
    await writeFile(path.join(dir, "0001_empty.sql"), "  \n");
    await expect(loadMigrations(dir)).rejects.toThrow(/empty/);
  });
});
