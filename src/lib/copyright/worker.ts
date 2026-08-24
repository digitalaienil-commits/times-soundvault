import "server-only";

import { calculateFileSha256 } from "@/lib/audio/checksum";
import { createStorageProvider } from "@/lib/storage/factory";

import {
  prepareBatchDirectories,
  publishArtifact,
  resolveCopyrightRoot,
  writeManifestExclusive,
} from "./artifacts";
import { parseCopyrightConfig } from "./config";
import { createCopyrightTestVideo } from "./ffmpeg";
import { buildCopyrightManifest } from "./manifest";
import {
  beginBatchBuild,
  claimNextCopyrightJob,
  completeBatchBuild,
  failCopyrightJob,
  loadBatchBuildSources,
} from "./repository";

import type { Pool } from "pg";

export async function runOneCopyrightJob(
  pool: Pool,
  workerId: string,
): Promise<boolean> {
  const config = parseCopyrightConfig();
  const job = await claimNextCopyrightJob(
    pool,
    workerId,
    config.leaseMs,
    config.buildConcurrency,
  );
  if (!job) return false;
  try {
    const began = await beginBatchBuild(pool, job.batchId);
    if (!began)
      throw new Error("Copyright batch is not available for building");
    const sources = await loadBatchBuildSources(pool, job.batchId);
    if (!sources.length)
      throw new Error("Copyright batch has no Master sources");
    const root = resolveCopyrightRoot(config.root);
    const run = await prepareBatchDirectories(root, job.batchId);
    const localPaths: string[] = [];
    const storage = createStorageProvider();
    try {
      for (const [index, source] of sources.entries()) {
        const destinationPath = run.sourcePath(index, source.extension);
        const materialized = await storage.materializeStoredObject({
          storageKey: source.storageKey,
          providerDriveId: source.providerDriveId,
          providerItemId: source.providerItemId,
          destinationPath,
        });
        if (materialized.byteSize !== source.byteSize)
          throw new Error("A stored Master changed size after verification");
        const sourceHash = await calculateFileSha256(destinationPath);
        if (sourceHash !== source.sha256)
          throw new Error(
            "A stored Master changed checksum after technical processing",
          );
        localPaths.push(destinationPath);
      }
      const manifest = buildCopyrightManifest(
        job.batchId,
        sources,
        config.gapSeconds * 1000,
      );
      await createCopyrightTestVideo({
        sourcePaths: localPaths,
        destinationPath: run.temporaryArtifactPath,
        gapSeconds: config.gapSeconds,
        totalDurationMs: manifest.totalDurationMs,
        timeoutMs: config.fileTimeoutMs,
      });
      for (const [index, source] of sources.entries()) {
        const postBuildHash = await calculateFileSha256(localPaths[index]!);
        if (postBuildHash !== source.sha256)
          throw new Error("Batch generation modified a materialized source");
      }
      await publishArtifact(run.temporaryArtifactPath, run.artifactPath);
      await writeManifestExclusive(run.manifestPath, manifest);
      const artifactSha256 = await calculateFileSha256(run.artifactPath);
      await completeBatchBuild(pool, {
        jobId: job.id,
        workerId,
        batchId: job.batchId,
        artifactKey: run.artifactKey,
        manifestKey: run.manifestKey,
        artifactSha256,
      });
      console.info(
        JSON.stringify({
          event: "copyright_batch_ready",
          jobId: job.id,
          batchId: job.batchId,
          itemCount: sources.length,
          durationMs: manifest.totalDurationMs,
        }),
      );
    } finally {
      await run.cleanup();
    }
  } catch (error) {
    const failure =
      error instanceof Error ? error : new Error("Batch build failed");
    await failCopyrightJob(pool, {
      job,
      workerId,
      error: failure,
      nextAttemptAt: new Date(
        Date.now() + 30_000 * 2 ** (job.attemptCount - 1),
      ),
    });
    console.error(
      JSON.stringify({
        event: "copyright_batch_failed",
        jobId: job.id,
        batchId: job.batchId,
        errorCode: "BATCH_BUILD_FAILED",
      }),
    );
  }
  return true;
}
