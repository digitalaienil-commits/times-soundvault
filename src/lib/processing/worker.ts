import "server-only";

import type { Pool } from "pg";

import { parseProcessingConfig } from "./config";
import {
  claimNextProcessingJob,
  markProcessingJobFailed,
  markProcessingJobSucceeded,
  markTechnicalFailed,
} from "./repository";
import {
  classifyProcessingError,
  finalizeExhaustedProviderFailure,
  processClaimedJob,
} from "./service";

export async function runOneProcessingJob(
  pool: Pool,
  workerId: string,
): Promise<boolean> {
  const config = parseProcessingConfig();
  const job = await claimNextProcessingJob(pool, workerId, config.leaseMs);
  if (!job) return false;
  try {
    await processClaimedJob(pool, job);
    await markProcessingJobSucceeded(pool, job.id, workerId);
    console.info(
      JSON.stringify({
        event: "processing_job_succeeded",
        jobId: job.id,
        jobType: job.jobType,
        revisionId: job.submissionRevisionId,
      }),
    );
  } catch (error) {
    const classified = classifyProcessingError(error);
    const delay =
      classified.retryAfterMs ??
      Math.min(30_000 * 2 ** Math.max(0, job.attemptCount - 1), 15 * 60_000);
    const status = await markProcessingJobFailed(pool, {
      job,
      workerId,
      errorCode: classified.code,
      errorMessage: classified.message,
      retryable: classified.retryable,
      nextAttemptAt: new Date(Date.now() + delay),
    });
    if (status === "failed") {
      if (job.jobType === "revision_processing")
        await markTechnicalFailed(
          pool,
          job.submissionRevisionId,
          classified.code,
          classified.message,
        );
      await finalizeExhaustedProviderFailure(pool, job, classified);
    }
    console.error(
      JSON.stringify({
        event: "processing_job_failed",
        jobId: job.id,
        jobType: job.jobType,
        revisionId: job.submissionRevisionId,
        errorCode: classified.code,
        retryScheduled: status === "retry_wait",
      }),
    );
  }
  return true;
}
