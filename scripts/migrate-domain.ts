import { createPostgresPool } from "@/lib/database/pool";
import { runDomainMigrations } from "@/lib/database/domain-migrations";

import { getScriptEnvironment } from "./environment";

async function main() {
  const environment = getScriptEnvironment();
  const pool = createPostgresPool(environment.databaseUrl);
  try {
    const statuses = await runDomainMigrations(pool);
    for (const status of statuses) {
      console.info(`${status.name}: ${status.state}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "SoundVault domain migration failed",
  );
  process.exitCode = 1;
});
