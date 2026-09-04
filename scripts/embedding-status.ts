import { createPostgresPool } from "@/lib/database/pool";
import { checkEmbeddingStatus } from "@/lib/embeddings/worker";
import { getScriptEnvironment } from "./environment";

async function main() {
  const environment = getScriptEnvironment();
  const pool = createPostgresPool(environment.databaseUrl);

  try {
    const status = await checkEmbeddingStatus(pool);
    console.info(
      `Embeddings Status:\n` +
        `  Published Tracks:      ${status.publishedTracks}\n` +
        `  Ready Embeddings:      ${status.readyEmbeddings}\n` +
        `  Queued Embeddings:     ${status.queuedEmbeddings}\n` +
        `  Processing Embeddings: ${status.processingEmbeddings}\n` +
        `  Stale Embeddings:      ${status.staleEmbeddings}\n` +
        `  Failed Embeddings:     ${status.failedEmbeddings}\n` +
        `  Last Embedded:         ${status.lastEmbeddedAt ?? "Never"}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Embedding status check failed",
  );
  process.exitCode = 1;
});
