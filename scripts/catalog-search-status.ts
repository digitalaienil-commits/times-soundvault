import { createPostgresPool } from "@/lib/database/pool";
import { getSearchDocumentStatus } from "@/lib/catalog-search/repository";

import { getScriptEnvironment } from "./environment";

async function main() {
  const pool = createPostgresPool(getScriptEnvironment().databaseUrl);
  try {
    console.info(JSON.stringify(await getSearchDocumentStatus(pool), null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Search index status failed",
  );
  process.exitCode = 1;
});
