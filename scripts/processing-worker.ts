import { randomUUID } from "node:crypto";
import os from "node:os";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { getDatabase } = await import("../src/lib/database/database");
  const { runOneProcessingJob } = await import("../src/lib/processing/worker");
  const id = `${os.hostname()}:${process.pid}:${randomUUID()}`;
  let stopping = false;
  process.once("SIGINT", () => {
    stopping = true;
  });
  process.once("SIGTERM", () => {
    stopping = true;
  });
  while (!stopping) {
    const processed = await runOneProcessingJob(getDatabase(), id);
    if (!processed) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  await getDatabase().end();
}
void main();
