import { randomUUID } from "node:crypto";
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
  const waiting = await database.query<{
    submission_id: string;
    submission_revision_id: string;
    provider_track_id: string;
  }>(
    `SELECT submission.id AS submission_id,run.submission_revision_id,run.provider_track_id FROM analysis.provider_run run JOIN workflow.submission submission ON submission.current_revision_id=run.submission_revision_id WHERE run.provider='cyanite' AND run.status='analyzing' AND run.provider_track_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM analysis.processing_job job WHERE job.job_type='cyanite_result_fetch' AND job.submission_revision_id=run.submission_revision_id AND job.status IN ('queued','running','retry_wait'))`,
  );
  for (const item of waiting.rows)
    await enqueueProcessingJob(database, {
      jobType: "cyanite_result_fetch",
      submissionId: item.submission_id,
      submissionRevisionId: item.submission_revision_id,
      idempotencyKey: `cyanite:${item.provider_track_id}:reconcile:${randomUUID()}`,
      maxAttempts: config.maxRetries,
    });
  console.info(
    `Reconciled ${missing.length} revision job(s) and ${waiting.rowCount} Cyanite job(s).`,
  );
  await database.end();
}
void main();
