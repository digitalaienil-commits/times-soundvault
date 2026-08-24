import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { getDatabase } = await import("../src/lib/database/database");
  const { reconcileCopyrightChecks, reconcileCopyrightJobs } =
    await import("../src/lib/copyright/repository");
  const checks = await reconcileCopyrightChecks(getDatabase());
  const jobs = await reconcileCopyrightJobs(getDatabase());
  console.info(
    JSON.stringify({ event: "copyright_reconciled", ...checks, ...jobs }),
  );
  await getDatabase().end();
}

void main();
