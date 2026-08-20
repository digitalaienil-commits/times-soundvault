import { createPostgresPool } from "@/lib/database/pool";
import { getDomainMigrationStatus } from "@/lib/database/domain-migrations";

import { getScriptEnvironment } from "./environment";

async function main() {
  const environment = getScriptEnvironment();
  const pool = createPostgresPool(environment.databaseUrl);
  try {
    const statuses = await getDomainMigrationStatus(pool);
    for (const status of statuses) {
      console.info(`${status.name}: ${status.state}`);
    }
    if (statuses.some((status) => status.state === "checksum_mismatch")) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Unable to read SoundVault domain migration status",
  );
  process.exitCode = 1;
});
