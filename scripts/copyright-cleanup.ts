import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { getDatabase } = await import("../src/lib/database/database");
  const { parseCopyrightConfig } = await import("../src/lib/copyright/config");
  const { cleanupExpiredArtifacts, resolveCopyrightRoot } =
    await import("../src/lib/copyright/artifacts");
  const { listExpiredCopyrightBatches, markCopyrightBatchesExpired } =
    await import("../src/lib/copyright/repository");
  const ids = await listExpiredCopyrightBatches(getDatabase());
  const removed = await cleanupExpiredArtifacts(
    resolveCopyrightRoot(parseCopyrightConfig().root),
    ids,
  );
  const expired = await markCopyrightBatchesExpired(getDatabase(), ids);
  console.info(
    JSON.stringify({ event: "copyright_cleanup", removed, expired }),
  );
  await getDatabase().end();
}

void main();
