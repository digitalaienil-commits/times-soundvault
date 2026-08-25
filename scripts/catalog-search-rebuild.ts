import { createPostgresPool } from "@/lib/database/pool";
import { rebuildSearchDocuments } from "@/lib/catalog-search/repository";

import { getScriptEnvironment } from "./environment";

async function main() {
  const pool = createPostgresPool(getScriptEnvironment().databaseUrl);
  try {
    const dryRun = process.argv.includes("--dry-run");
    console.info(
      JSON.stringify(await rebuildSearchDocuments(pool, dryRun), null, 2),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Search index rebuild failed",
  );
  process.exitCode = 1;
});
