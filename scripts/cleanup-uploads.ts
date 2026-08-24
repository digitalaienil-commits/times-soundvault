import { loadEnvConfig } from "@next/env";

import { getDatabase } from "../src/lib/database/database";
import {
  cleanupCancelledUpload,
  listCleanupCandidates,
} from "../src/lib/domain/uploads/repository";
import { parseStorageConfig } from "../src/lib/storage/config";
import { createStorageProvider } from "../src/lib/storage/factory";

loadEnvConfig(process.cwd());

async function main() {
  const confirmed = process.argv.includes("--confirm");
  const database = getDatabase();
  const candidates = await listCleanupCandidates(database);
  console.log(
    `${candidates.length} cancelled or expired draft upload sessions are eligible.`,
  );
  for (const candidate of candidates) {
    console.log(`${candidate.sessionId} ${candidate.status}`);
  }
  if (!confirmed) {
    console.log(
      "Dry run only. Pass --confirm to delete provider objects for these safe draft sessions.",
    );
    await database.end();
    return;
  }
  const config = parseStorageConfig();
  const provider = createStorageProvider();
  for (const candidate of candidates) {
    await cleanupCancelledUpload(
      database,
      candidate.sessionId,
      config,
      provider,
    );
    console.log(`${candidate.sessionId} cleaned`);
  }
  await database.end();
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Upload cleanup failed",
  );
  process.exitCode = 1;
});
