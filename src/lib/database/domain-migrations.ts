import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Pool, PoolClient, QueryResultRow } from "pg";

interface MigrationRecord extends QueryResultRow {
  name: string;
  checksum_sha256: string;
  applied_at: Date;
}

export interface DomainMigrationStatus {
  name: string;
  checksumSha256: string;
  appliedAt: Date | null;
  state: "applied" | "pending" | "checksum_mismatch";
}

interface DomainMigrationOptions {
  migrationsDirectory?: string;
  trackingSchema?: string;
}

interface MigrationFile {
  name: string;
  sql: string;
  checksumSha256: string;
}

export class DomainMigrationError extends Error {
  constructor(
    public readonly code:
      | "CHECKSUM_MISMATCH"
      | "INVALID_MIGRATION_NAME"
      | "INVALID_TRACKING_SCHEMA",
    message: string,
  ) {
    super(message);
    this.name = "DomainMigrationError";
  }
}

function resolveOptions(options: DomainMigrationOptions = {}) {
  const migrationsDirectory =
    options.migrationsDirectory ??
    path.join(process.cwd(), "migrations", "domain");
  const trackingSchema = options.trackingSchema ?? "system";
  if (!/^[a-z_][a-z0-9_]*$/.test(trackingSchema)) {
    throw new DomainMigrationError(
      "INVALID_TRACKING_SCHEMA",
      "Domain migration tracking schema must be a safe PostgreSQL identifier",
    );
  }
  return { migrationsDirectory, trackingSchema };
}

function qualifiedTrackingTable(trackingSchema: string): string {
  return `"${trackingSchema}".schema_migration`;
}

async function readMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    names.map(async (name) => {
      if (!/^\d{4}-[a-z0-9-]+\.sql$/.test(name)) {
        throw new DomainMigrationError(
          "INVALID_MIGRATION_NAME",
          `Invalid domain migration filename: ${name}`,
        );
      }
      const sql = await readFile(path.join(directory, name), "utf8");
      return {
        name,
        sql,
        checksumSha256: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

async function ensureTrackingTable(
  client: PoolClient,
  trackingSchema: string,
): Promise<void> {
  const table = qualifiedTrackingTable(trackingSchema);
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${trackingSchema}"`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${table} (
    name TEXT PRIMARY KEY,
    checksum_sha256 TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT schema_migration_checksum_check
      CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
  )`);
}

async function loadAppliedMigrations(
  client: PoolClient,
  trackingSchema: string,
): Promise<Map<string, MigrationRecord>> {
  const result = await client.query<MigrationRecord>(
    `SELECT name, checksum_sha256, applied_at
     FROM ${qualifiedTrackingTable(trackingSchema)}
     ORDER BY name`,
  );
  return new Map(result.rows.map((row) => [row.name, row]));
}

export async function runDomainMigrations(
  pool: Pool,
  options: DomainMigrationOptions = {},
): Promise<DomainMigrationStatus[]> {
  const { migrationsDirectory, trackingSchema } = resolveOptions(options);
  const migrations = await readMigrationFiles(migrationsDirectory);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureTrackingTable(client, trackingSchema);
    await client.query(
      `LOCK TABLE ${qualifiedTrackingTable(trackingSchema)} IN EXCLUSIVE MODE`,
    );
    const applied = await loadAppliedMigrations(client, trackingSchema);
    const statuses: DomainMigrationStatus[] = [];

    for (const migration of migrations) {
      const existing = applied.get(migration.name);
      if (existing) {
        if (existing.checksum_sha256 !== migration.checksumSha256) {
          throw new DomainMigrationError(
            "CHECKSUM_MISMATCH",
            `Applied domain migration ${migration.name} has changed`,
          );
        }
        statuses.push({
          name: migration.name,
          checksumSha256: migration.checksumSha256,
          appliedAt: existing.applied_at,
          state: "applied",
        });
        continue;
      }

      await client.query(migration.sql);
      const inserted = await client.query<MigrationRecord>(
        `INSERT INTO ${qualifiedTrackingTable(trackingSchema)}
           (name, checksum_sha256)
         VALUES ($1, $2)
         RETURNING name, checksum_sha256, applied_at`,
        [migration.name, migration.checksumSha256],
      );
      statuses.push({
        name: migration.name,
        checksumSha256: migration.checksumSha256,
        appliedAt: inserted.rows[0]?.applied_at ?? null,
        state: "applied",
      });
    }

    await client.query("COMMIT");
    return statuses;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDomainMigrationStatus(
  pool: Pool,
  options: DomainMigrationOptions = {},
): Promise<DomainMigrationStatus[]> {
  const { migrationsDirectory, trackingSchema } = resolveOptions(options);
  const migrations = await readMigrationFiles(migrationsDirectory);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureTrackingTable(client, trackingSchema);
    const applied = await loadAppliedMigrations(client, trackingSchema);
    await client.query("COMMIT");
    return migrations.map((migration) => {
      const existing = applied.get(migration.name);
      return {
        name: migration.name,
        checksumSha256: migration.checksumSha256,
        appliedAt: existing?.applied_at ?? null,
        state: !existing
          ? "pending"
          : existing.checksum_sha256 === migration.checksumSha256
            ? "applied"
            : "checksum_mismatch",
      };
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
