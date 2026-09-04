import { createPostgresPool } from "@/lib/database/pool";
import { reconcileEmbeddingJobs } from "@/lib/embeddings/worker";
import { getScriptEnvironment } from "./environment";

async function main() {
  const environment = getScriptEnvironment();
  const pool = createPostgresPool(environment.databaseUrl);

  try {
    const result = await reconcileEmbeddingJobs(pool);
    console.info(
      `Embedding reconcile complete: enqueued ${result.enqueued}, updated ${result.updated}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Embedding reconcile failed",
  );
  process.exitCode = 1;
});
