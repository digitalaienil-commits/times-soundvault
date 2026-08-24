import { randomUUID } from "node:crypto";
import os from "node:os";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  console.info("Checking the durable processing queue.");
  const { getDatabase } = await import("../src/lib/database/database");
  const { runOneProcessingJob } = await import("../src/lib/processing/worker");
  const processed = await runOneProcessingJob(
    getDatabase(),
    `${os.hostname()}:${process.pid}:${randomUUID()}`,
  );
  console.info(
    processed ? "Processed one queued job." : "No processing job is ready.",
  );
  await getDatabase().end();
}
void main();
