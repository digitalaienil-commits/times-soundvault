import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createPostgresPool } from "@/lib/database/pool";
import { runOneEmbeddingJob } from "@/lib/embeddings/worker";
import { getScriptEnvironment } from "./environment";

async function main() {
  const environment = getScriptEnvironment();
  const pool = createPostgresPool(environment.databaseUrl);
  const workerId = `embedding-worker-${randomUUID().slice(0, 8)}`;
  let running = true;

  const handleStop = () => {
    running = false;
  };
  process.on("SIGINT", handleStop);
  process.on("SIGTERM", handleStop);

  console.info(`Embedding worker started: ${workerId}`);

  try {
    while (running) {
      const processed = await runOneEmbeddingJob(pool, workerId);
      if (!processed) {
        await delay(2000);
      }
    }
  } finally {
    await pool.end();
    console.info("Embedding worker exited");
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Embedding worker failure",
  );
  process.exitCode = 1;
});
