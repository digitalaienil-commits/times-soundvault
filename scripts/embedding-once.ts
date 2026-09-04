import { randomUUID } from "node:crypto";
import { createPostgresPool } from "@/lib/database/pool";
import { runOneEmbeddingJob } from "@/lib/embeddings/worker";
import { getScriptEnvironment } from "./environment";

async function main() {
  const environment = getScriptEnvironment();
  const pool = createPostgresPool(environment.databaseUrl);
  const workerId = `embedding-cli-${randomUUID().slice(0, 8)}`;

  try {
    const processed = await runOneEmbeddingJob(pool, workerId);
    console.info(
      processed ? "Processed 1 embedding job" : "No embedding jobs ready",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Embedding once failed",
  );
  process.exitCode = 1;
});
