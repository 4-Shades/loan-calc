import { describe, expect, it } from "vitest";
import { databaseSsl } from "@/lib/dbConfig";

const remote = "postgresql://app:secret@db.example.com:5432/loancalc";

describe("databaseSsl (REQ-INT-001: TLS in non-local environments)", () => {
  it("requires verified TLS for a remote database in production", () => {
    expect(databaseSsl({ url: remote, nodeEnv: "production" })).toEqual({ rejectUnauthorized: true });
  });

  it.each(["localhost", "127.0.0.1", "[::1]", "postgres"])("skips TLS for local host %s", (host) => {
    expect(databaseSsl({ url: `postgresql://app:secret@${host}:5432/loancalc`, nodeEnv: "production" })).toBe(false);
  });

  it("skips TLS outside production", () => {
    expect(databaseSsl({ url: remote, nodeEnv: "development" })).toBe(false);
  });

  it.each([
    ["true", { rejectUnauthorized: true }],
    ["require", { rejectUnauthorized: true }],
    ["no-verify", { rejectUnauthorized: false }],
    ["false", false],
    ["disable", false],
  ] as const)("honours DATABASE_SSL=%s", (override, expected) => {
    expect(databaseSsl({ url: `postgresql://app@localhost/loancalc`, nodeEnv: "development", override })).toEqual(expected);
  });

  it("also honours sslmode in the connection string", () => {
    expect(databaseSsl({ url: `${remote}?sslmode=disable`, nodeEnv: "production" })).toBe(false);
  });

  it("rejects an unknown DATABASE_SSL value", () => {
    expect(() => databaseSsl({ url: remote, nodeEnv: "production", override: "maybe" })).toThrow(/DATABASE_SSL/);
  });
});
