import { randomUUID } from "node:crypto";
import os from "node:os";

import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { getDatabase } = await import("../src/lib/database/database");
  const { runOneCopyrightJob } = await import("../src/lib/copyright/worker");
  const processed = await runOneCopyrightJob(
    getDatabase(),
    `${os.hostname()}:${process.pid}:${randomUUID()}`,
  );
  console.info(
    processed ? "Processed one copyright job." : "No copyright job is ready.",
  );
  await getDatabase().end();
}

void main();
