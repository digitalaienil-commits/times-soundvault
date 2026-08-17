import { readFile } from "node:fs/promises";
import path from "node:path";

import { createPostgresPool } from "@/lib/database/pool";

import { getScriptEnvironment } from "./environment";

const MIGRATION_NAME = "0001-team-access.sql";

async function main() {
  const environment = getScriptEnvironment();
  const pool = createPostgresPool(environment.databaseUrl);
  const client = await pool.connect();
  try {
    const sql = await readFile(
      path.join(process.cwd(), "migrations", "auth", MIGRATION_NAME),
      "utf8",
    );
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA IF NOT EXISTS auth");
    await client.query(`CREATE TABLE IF NOT EXISTS auth.soundvault_migration (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const existing = await client.query(
      `SELECT 1 FROM auth.soundvault_migration WHERE name = $1`,
      [MIGRATION_NAME],
    );
    if (existing.rowCount === 0) {
      await client.query(sql);
      await client.query(
        `INSERT INTO auth.soundvault_migration (name) VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [MIGRATION_NAME],
      );
      console.info(`Applied SoundVault auth migration ${MIGRATION_NAME}.`);
    } else {
      console.info(
        `SoundVault auth migration ${MIGRATION_NAME} is already applied.`,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(() => {
  console.error(
    "SoundVault auth migration failed. Review the database connection and migration state.",
  );
  process.exitCode = 1;
});
