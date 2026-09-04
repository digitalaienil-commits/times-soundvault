import "server-only";

import type { Pool } from "pg";

import { calculateFileSha256 } from "@/lib/audio/checksum";
import { measureAudioFile } from "@/lib/audio/ffmpeg";
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

import { parseProcessingConfig } from "./config";
import {
  beginRevisionProcessing,
  clearTechnicalIssues,
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
    await finalizeRevisionForReview(pool, {
      submissionId: job.submissionId,
      revisionId: job.submissionRevisionId,
      overallStatus: "complete",
      aiStatus: "disabled",
    });
  } finally {
    await run.cleanup();
  }
}

export async function processClaimedJob(
  pool: Pool,
  job: ProcessingJobDto,
): Promise<void> {
  if (job.jobType !== "revision_processing")
    throw new ProcessingError(
      "UNSUPPORTED_PROCESSING_JOB",
      "This processing job type is no longer supported.",
      false,
    );
  return processRevision(pool, job);
}

export function classifyProcessingError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
} {
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
  void pool;
  void job;
  void error;
}
