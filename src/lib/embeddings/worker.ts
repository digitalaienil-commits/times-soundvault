import "server-only";

import type { Pool } from "pg";

import { parseEmbeddingConfig } from "./config";
import { createEmbeddingProvider } from "./factory";
import {
  claimNextEmbeddingJob,
  completeEmbeddingJob,
  enqueueMissingEmbeddings,
  failEmbeddingJob,
  getEmbeddingStatus,
} from "./repository";

export async function runOneEmbeddingJob(
  pool: Pool,
  workerId: string,
): Promise<boolean> {
  const config = parseEmbeddingConfig();
  const provider = createEmbeddingProvider();

  const job = await claimNextEmbeddingJob(
    pool,
    workerId,
    config.jobLeaseMs,
    config.jobConcurrency,
  );

  if (!job) return false;

  try {
    const vector = await provider.embedDocument(job.canonicalText);

    if (vector.length !== job.dimension) {
      throw new Error(
        `Generated vector dimension (${vector.length}) does not match expected job dimension (${job.dimension})`,
      );
    }

    const completed = await completeEmbeddingJob(pool, {
      id: job.id,
      workerId,
      embedding: vector,
      inputHash: job.inputHash,
    });

    if (!completed) {
      throw new Error(
        "Failed to commit completed embedding vector to database",
      );
    }

    console.info(
      JSON.stringify({
        event: "embedding_job_completed",
        jobId: job.id,
        trackId: job.trackId,
        provider: job.provider,
        model: job.model,
        dimension: job.dimension,
      }),
    );

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        event: "embedding_job_failed",
        jobId: job.id,
        trackId: job.trackId,
        error: message,
      }),
    );

    await failEmbeddingJob(pool, {
      id: job.id,
      workerId,
      error: message,
      retryInMs: 30_000,
    });

    return false;
  }
}

export async function reconcileEmbeddingJobs(
  pool: Pool,
): Promise<{ enqueued: number; updated: number }> {
  const config = parseEmbeddingConfig();
  return enqueueMissingEmbeddings(pool, {
    provider: config.provider,
    model: config.model,
    modelVersion: config.modelVersion,
    dimension: config.dimension,
  });
}

export async function checkEmbeddingStatus(pool: Pool) {
  return getEmbeddingStatus(pool);
}
