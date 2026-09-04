import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { getDatabase } = await import("../src/lib/database/database");
  const { parseProcessingConfig } =
    await import("../src/lib/processing/config");
  const { enqueueProcessingJob, findMissingProcessingJobs } =
    await import("../src/lib/processing/repository");
  const database = getDatabase();
  const config = parseProcessingConfig();
  const missing = await findMissingProcessingJobs(database);
  for (const item of missing)
    await enqueueProcessingJob(database, {
      jobType: "revision_processing",
      submissionId: item.submissionId,
      submissionRevisionId: item.revisionId,
      idempotencyKey: `revision:${item.revisionId}:processing`,
      maxAttempts: config.maxRetries,
    });
  console.info(`Reconciled ${missing.length} revision job(s).`);
  await database.end();
}
void main();
