import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  getDomainMigrationStatus,
  runDomainMigrations,
} from "./domain-migrations";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

function uniqueSchema() {
  return `migration_test_${randomUUID().replaceAll("-", "")}`;
}

databaseDescribe("domain migration runner", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("migrates a clean tracking schema and is idempotent", async () => {
    const schema = uniqueSchema();
    const directory = await mkdtemp(path.join(tmpdir(), "soundvault-domain-"));
    try {
      await writeFile(
        path.join(directory, "0001-proof.sql"),
        `CREATE TABLE "${schema}".proof (id INTEGER PRIMARY KEY);`,
      );
      const first = await runDomainMigrations(pool, {
        migrationsDirectory: directory,
        trackingSchema: schema,
      });
      const second = await runDomainMigrations(pool, {
        migrationsDirectory: directory,
        trackingSchema: schema,
      });
      const status = await getDomainMigrationStatus(pool, {
        migrationsDirectory: directory,
        trackingSchema: schema,
      });

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(status[0]?.state).toBe("applied");
      const records = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "${schema}".schema_migration`,
      );
      expect(records.rows[0]?.count).toBe("1");
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a changed checksum for an applied migration", async () => {
    const schema = uniqueSchema();
    const directory = await mkdtemp(path.join(tmpdir(), "soundvault-domain-"));
    const migrationPath = path.join(directory, "0001-proof.sql");
    try {
      await writeFile(
        migrationPath,
        `CREATE TABLE "${schema}".proof (id INTEGER PRIMARY KEY);`,
      );
      await runDomainMigrations(pool, {
        migrationsDirectory: directory,
        trackingSchema: schema,
      });
      await writeFile(
        migrationPath,
        `CREATE TABLE "${schema}".proof (id BIGINT PRIMARY KEY);`,
      );

      await expect(
        runDomainMigrations(pool, {
          migrationsDirectory: directory,
          trackingSchema: schema,
        }),
      ).rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" });
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
