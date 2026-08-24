import "server-only";

import { stat } from "node:fs/promises";

import type { Pool } from "pg";

import { createMusicAnalysisProvider } from "@/lib/analysis/factory";
import {
  failCyaniteRun,
  findCyaniteRunByRevision,
  markCyaniteAnalyzing,
  persistCyaniteResult,
  prepareCyaniteRun,
} from "@/lib/analysis/repository";
import { AnalysisProviderError } from "@/lib/analysis/provider";
import { calculateFileSha256 } from "@/lib/audio/checksum";
import {
  createCyaniteMp3Derivative,
  measureAudioFile,
} from "@/lib/audio/ffmpeg";
import { probeAudioFile } from "@/lib/audio/ffprobe";
import { AudioToolError, getAudioToolVersion } from "@/lib/audio/process";
import {
  buildFileQcIssues,
  buildStemAlignmentIssue,
  possibleDuplicateIssue,
  type TechnicalQcIssue,
} from "@/lib/audio/qc";
import { createStorageProvider } from "@/lib/storage/factory";
import { StorageProviderError } from "@/lib/storage/provider";
import type { ProcessingJobDto } from "@/types/processing";

import { parseCyaniteConfig } from "../analysis/cyanite/config";
import { parseProcessingConfig } from "./config";
import {
  beginRevisionProcessing,
  clearTechnicalIssues,
  enqueueProcessingJob,
  finalizeRevisionForReview,
  findAudioFileIdsByChecksum,
  loadProcessingSourceFiles,
  markTechnicalComplete,
  persistTechnicalResult,
  upsertQcIssues,
} from "./repository";
import { createProcessingRunDirectory } from "./temp-storage";

export class ProcessingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProcessingError";
  }
}

async function processRevision(
  pool: Pool,
  job: ProcessingJobDto,
): Promise<void> {
  const config = parseProcessingConfig();
  await beginRevisionProcessing(
    pool,
    job.submissionId,
    job.submissionRevisionId,
  );
  await clearTechnicalIssues(pool, job.submissionRevisionId);
  const sources = await loadProcessingSourceFiles(
    pool,
    job.submissionId,
    job.submissionRevisionId,
  );
  if (!sources.length)
    throw new ProcessingError(
      "SOURCE_MISSING",
      "No verified source files are available",
      false,
    );
  const storage = createStorageProvider();
  const run = await createProcessingRunDirectory(config.tempRoot);
  const results: Array<{
    source: (typeof sources)[number];
    probe: Awaited<ReturnType<typeof probeAudioFile>>;
    localPath: string;
  }> = [];
  const issues: TechnicalQcIssue[] = [];
  try {
    const [ffmpegVersion, ffprobeVersion] = await Promise.all([
      getAudioToolVersion("ffmpeg", config.fileTimeoutMs),
      getAudioToolVersion("ffprobe", config.fileTimeoutMs),
    ]);
    for (const source of sources) {
      const localPath = run.objectPath(source.extension);
      const object = await storage.materializeStoredObject({
        storageKey: source.storageKey,
        providerDriveId: source.providerDriveId,
        providerItemId: source.providerItemId,
        destinationPath: localPath,
      });
      if (object.byteSize !== source.byteSize)
        throw new ProcessingError(
          "SIZE_MISMATCH",
          "Stored source size changed after verification",
          false,
        );
      const [sha256, probe] = await Promise.all([
        calculateFileSha256(localPath),
        probeAudioFile(localPath, config.fileTimeoutMs),
      ]);
      const measurements = await measureAudioFile(
        localPath,
        probe.durationMs,
        config.fileTimeoutMs,
      );
      const matches = await findAudioFileIdsByChecksum(pool, sha256);
      await persistTechnicalResult(pool, {
        source,
        sha256,
        probe,
        measurements,
        toolVersions: { ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion },
      });
      issues.push(
        ...buildFileQcIssues({
          audioFileId: source.audioFileId,
          role: source.assetRole,
          durationMs: probe.durationMs,
          containerFormat: probe.containerFormat,
          bitDepth: probe.bitDepth,
          channels: probe.channels,
          channelLayout: probe.channelLayout,
          leadingSilenceMs: measurements.leadingSilenceMs,
          trailingSilenceMs: measurements.trailingSilenceMs,
          samplePeakDbfs: measurements.samplePeakDbfs,
          truePeakDbtp: measurements.truePeakDbtp,
          leadingSilenceWarningMs: config.leadingSilenceWarningMs,
          trailingSilenceWarningMs: config.trailingSilenceWarningMs,
        }),
      );
      const duplicate = possibleDuplicateIssue({
        audioFileId: source.audioFileId,
        matchingAudioFileIds: matches,
      });
      if (duplicate) issues.push(duplicate);
      results.push({ source, probe, localPath });
    }
    const master = results.find((item) => item.source.assetRole === "master");
    if (!master)
      throw new ProcessingError(
        "MASTER_MISSING",
        "A Master source is required",
        false,
      );
    for (const stem of results.filter(
      (item) => item.source.assetRole === "stem",
    )) {
      const alignment = buildStemAlignmentIssue({
        audioFileId: stem.source.audioFileId,
        masterDurationMs: master.probe.durationMs,
        stemDurationMs: stem.probe.durationMs,
      });
      if (alignment) issues.push(alignment);
    }
    await upsertQcIssues(pool, job.submissionRevisionId, issues);
    await markTechnicalComplete(pool, job.submissionRevisionId);
    const cyanite = parseCyaniteConfig();
    if (!cyanite.enabled) {
      await finalizeRevisionForReview(pool, {
        submissionId: job.submissionId,
        revisionId: job.submissionRevisionId,
        overallStatus: "complete",
        cyaniteStatus: "disabled",
      });
      return;
    }
    if (master.probe.durationMs > 15 * 60 * 1000) {
      await upsertQcIssues(pool, job.submissionRevisionId, [
        {
          audioFileId: master.source.audioFileId,
          code: "cyanite_unsupported_duration",
          severity: "warning",
          message:
            "Cyanite analysis was skipped because the Master exceeds 15 minutes.",
          details: { durationMs: master.probe.durationMs },
        },
      ]);
      await finalizeRevisionForReview(pool, {
        submissionId: job.submissionId,
        revisionId: job.submissionRevisionId,
        overallStatus: "partial",
        cyaniteStatus: "skipped_unsupported_duration",
      });
      return;
    }
    const provider = createMusicAnalysisProvider();
    if (!provider)
      throw new ProcessingError(
        "CYANITE_DISABLED",
        "Cyanite configuration changed during processing",
        false,
      );
    let providerPath = master.localPath;
    let derivative: { created: boolean; byteSize: number } | undefined;
    if (master.source.extension === ".wav") {
      providerPath = run.derivativePath();
      await createCyaniteMp3Derivative(
        master.localPath,
        providerPath,
        config.fileTimeoutMs,
      );
      derivative = { created: true, byteSize: (await stat(providerPath)).size };
    }
    const externalId = `soundvault:${job.submissionRevisionId}`;
    const providerRun = await prepareCyaniteRun(pool, {
      revisionId: job.submissionRevisionId,
      externalId,
      inputMetadata: {
        sourceAudioFileId: master.source.audioFileId,
        sourceExtension: master.source.extension,
        derivative: derivative ?? {
          created: false,
          byteSize: master.source.byteSize,
        },
        bitrateKbps: master.source.extension === ".wav" ? 320 : null,
      },
    });
    const reference = await provider.createAnalysis({
      filePath: providerPath,
      externalId,
      title: master.source.displayTitle,
    });
    await markCyaniteAnalyzing(pool, providerRun.id, reference);
    await enqueueProcessingJob(pool, {
      jobType: "cyanite_result_fetch",
      submissionId: job.submissionId,
      submissionRevisionId: job.submissionRevisionId,
      idempotencyKey: `cyanite:${reference.providerTrackId}:result`,
      maxAttempts: cyanite.maxRetries,
    });
  } finally {
    await run.cleanup();
  }
}

async function fetchCyaniteResult(
  pool: Pool,
  job: ProcessingJobDto,
): Promise<void> {
  const provider = createMusicAnalysisProvider();
  if (!provider)
    throw new ProcessingError("CYANITE_DISABLED", "Cyanite is disabled", false);
  const run = await findCyaniteRunByRevision(pool, job.submissionRevisionId);
  if (!run?.providerTrackId)
    throw new ProcessingError(
      "CYANITE_RUN_MISSING",
      "Cyanite run is missing its provider reference",
      false,
    );
  const reference = {
    provider: "cyanite" as const,
    providerVersion: "v7" as const,
    providerTrackId: run.providerTrackId,
    externalId: run.externalId,
    reused: true,
  };
  const result = await provider.getAnalysis(reference);
  if (result.status === "processing")
    throw new ProcessingError(
      "CYANITE_PENDING",
      "Cyanite analysis is still processing",
      true,
    );
  if (result.status === "failed")
    throw new ProcessingError(
      "CYANITE_FAILED",
      result.errorMessage ?? "Cyanite analysis failed",
      false,
    );
  await persistCyaniteResult(pool, run, result);
  await finalizeRevisionForReview(pool, {
    submissionId: job.submissionId,
    revisionId: job.submissionRevisionId,
    overallStatus: "complete",
    cyaniteStatus: "complete",
  });
  await pool.query(
    `UPDATE analysis.webhook_event SET processed_at=now(),processing_error=NULL WHERE provider='cyanite' AND resource_id=$1 AND processed_at IS NULL`,
    [run.providerTrackId],
  );
}

export async function processClaimedJob(
  pool: Pool,
  job: ProcessingJobDto,
): Promise<void> {
  if (job.jobType === "revision_processing") return processRevision(pool, job);
  return fetchCyaniteResult(pool, job);
}

export function classifyProcessingError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
} {
  if (error instanceof AnalysisProviderError)
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
    };
  if (error instanceof ProcessingError)
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  if (error instanceof AudioToolError)
    return {
      code: error.code,
      message: error.message,
      retryable: error.code === "TOOL_TIMEOUT",
    };
  if (error instanceof StorageProviderError)
    return {
      code: error.code,
      message: error.message,
      retryable: error.code === "PROVIDER_FAILURE",
    };
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT")
    return {
      code: "TOOL_OR_SOURCE_MISSING",
      message: "A required private source or audio tool was not found",
      retryable: false,
    };
  return {
    code: "PROCESSING_FAILED",
    message: error instanceof Error ? error.message : "Processing failed",
    retryable: true,
  };
}

export async function finalizeExhaustedProviderFailure(
  pool: Pool,
  job: ProcessingJobDto,
  error: { code: string; message: string },
): Promise<void> {
  if (job.jobType !== "cyanite_result_fetch") return;
  await failCyaniteRun(
    pool,
    job.submissionRevisionId,
    error.code,
    error.message,
  );
  await upsertQcIssues(pool, job.submissionRevisionId, [
    {
      audioFileId: null,
      code: "cyanite_unavailable",
      severity: "warning",
      message:
        "Technical processing completed, but Cyanite analysis is unavailable.",
      details: { errorCode: error.code },
    },
  ]);
  await finalizeRevisionForReview(pool, {
    submissionId: job.submissionId,
    revisionId: job.submissionRevisionId,
    overallStatus: "partial",
    cyaniteStatus: "failed",
  });
}
