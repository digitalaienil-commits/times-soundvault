import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type {
  FileTechnicalResultDto,
  NormalizedAnalysisResult,
  ProcessingAnalysisDto,
  ProcessingJobDto,
  ProcessingJobType,
  QcIssueDto,
} from "@/types/processing";

import type { ProbedAudio } from "@/lib/audio/ffprobe";
import type { AudioMeasurements } from "@/lib/audio/ffmpeg";
import type { TechnicalQcIssue } from "@/lib/audio/qc";

type Queryable = Pick<Pool | PoolClient, "query">;

export interface ProcessingSourceFile {
  audioFileId: string;
  assetId: string;
  submissionId: string;
  submissionRevisionId: string;
  trackId: string;
  ownerUserId: string;
  assetRole: "master" | "stem";
  stemType: string | null;
  displayTitle: string;
  originalFilename: string;
  storageBackend: "local" | "onedrive";
  storageKey: string;
  providerDriveId: string | null;
  providerItemId: string | null;
  byteSize: number;
  extension: ".wav" | ".mp3";
}

export interface PersistedTechnicalResult {
  source: ProcessingSourceFile;
  sha256: string;
  probe: ProbedAudio;
  measurements: AudioMeasurements;
  toolVersions: Record<string, string>;
}

function mapJob(row: Record<string, unknown>): ProcessingJobDto {
  return {
    id: String(row.id),
    jobType: row.job_type as ProcessingJobType,
    submissionId: String(row.submission_id),
    submissionRevisionId: String(row.submission_revision_id),
    status: row.status as ProcessingJobDto["status"],
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
    leaseExpiresAt: row.lease_expires_at
      ? new Date(row.lease_expires_at as string | Date).toISOString()
      : null,
    lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
    lastErrorMessage: row.last_error_message
      ? String(row.last_error_message)
      : null,
  };
}

export async function enqueueProcessingJob(
  database: Queryable,
  input: {
    jobType: ProcessingJobType;
    submissionId: string;
    submissionRevisionId: string;
    idempotencyKey: string;
    maxAttempts: number;
  },
): Promise<string> {
  const id = randomUUID();
  const result = await database.query<{ id: string } & QueryResultRow>(
    `INSERT INTO analysis.processing_job (
       id, job_type, submission_id, submission_revision_id,
       idempotency_key, max_attempts
     ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (idempotency_key) DO UPDATE
       SET idempotency_key = EXCLUDED.idempotency_key
     RETURNING id`,
    [
      id,
      input.jobType,
      input.submissionId,
      input.submissionRevisionId,
      input.idempotencyKey,
      input.maxAttempts,
    ],
  );
  return result.rows[0]?.id ?? id;
}

export async function claimNextProcessingJob(
  pool: Pool,
  workerId: string,
  leaseMs: number,
): Promise<ProcessingJobDto | null> {
  const result = await pool.query<Record<string, unknown> & QueryResultRow>(
    `UPDATE analysis.processing_job job
     SET status = 'running', attempt_count = attempt_count + 1,
         lease_owner = $1,
         lease_expires_at = now() + ($2::text || ' milliseconds')::interval,
         started_at = COALESCE(started_at, now()),
         last_error_code = NULL, last_error_message = NULL
     WHERE job.id = (
       SELECT candidate.id
       FROM analysis.processing_job candidate
       WHERE ((
         candidate.status IN ('queued', 'retry_wait')
         AND candidate.next_attempt_at <= now()
       ) OR (
         candidate.status = 'running'
         AND candidate.lease_expires_at <= now()
       ))
       AND candidate.attempt_count < candidate.max_attempts
       ORDER BY candidate.next_attempt_at, candidate.created_at, candidate.id
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING job.*`,
    [workerId, leaseMs],
  );
  return result.rows[0] ? mapJob(result.rows[0]) : null;
}

export async function markProcessingJobSucceeded(
  database: Queryable,
  jobId: string,
  workerId: string,
): Promise<void> {
  await database.query(
    `UPDATE analysis.processing_job
     SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL,
         completed_at = now(), last_error_code = NULL, last_error_message = NULL
     WHERE id = $1 AND status = 'running' AND lease_owner = $2`,
    [jobId, workerId],
  );
}

export async function markProcessingJobFailed(
  database: Queryable,
  input: {
    job: ProcessingJobDto;
    workerId: string;
    errorCode: string;
    errorMessage: string;
    retryable: boolean;
    nextAttemptAt: Date;
  },
): Promise<"retry_wait" | "failed"> {
  const retry =
    input.retryable && input.job.attemptCount < input.job.maxAttempts;
  await database.query(
    `UPDATE analysis.processing_job
     SET status = $3, lease_owner = NULL, lease_expires_at = NULL,
         next_attempt_at = $4, last_error_code = $5,
         last_error_message = $6,
         completed_at = CASE WHEN $3 = 'failed' THEN now() ELSE NULL END
     WHERE id = $1 AND status = 'running' AND lease_owner = $2`,
    [
      input.job.id,
      input.workerId,
      retry ? "retry_wait" : "failed",
      input.nextAttemptAt,
      input.errorCode.slice(0, 100),
      input.errorMessage.slice(0, 500),
    ],
  );
  return retry ? "retry_wait" : "failed";
}

export async function beginRevisionProcessing(
  pool: Pool,
  submissionId: string,
  revisionId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const state = await client.query<
      {
        status: string;
        track_id: string;
        current_revision_id: string;
      } & QueryResultRow
    >(
      `SELECT status, track_id, current_revision_id
       FROM workflow.submission WHERE id = $1 FOR UPDATE`,
      [submissionId],
    );
    const submission = state.rows[0];
    if (!submission || submission.current_revision_id !== revisionId) {
      throw new Error("Processing job does not match the current Revision");
    }
    await client.query(
      `INSERT INTO analysis.revision_analysis (
         id, submission_revision_id, track_id, technical_status,
         ai_status, overall_status, started_at
       ) VALUES ($1,$2,$3,'processing','not_started','processing',now())
       ON CONFLICT (submission_revision_id) DO UPDATE
         SET technical_status = CASE
               WHEN analysis.revision_analysis.technical_status = 'complete'
                 THEN 'complete' ELSE 'processing' END,
             overall_status = CASE
               WHEN analysis.revision_analysis.overall_status IN ('complete','partial')
                 THEN analysis.revision_analysis.overall_status ELSE 'processing' END,
             started_at = COALESCE(analysis.revision_analysis.started_at, now()),
             last_error_code = NULL, last_error_message = NULL,
             row_version = analysis.revision_analysis.row_version + 1`,
      [randomUUID(), revisionId, submission.track_id],
    );
    if (submission.status === "submitted") {
      await client.query(
        `UPDATE workflow.submission
         SET status = 'processing', row_version = row_version + 1
         WHERE id = $1 AND status = 'submitted'`,
        [submissionId],
      );
      await client.query(
        `INSERT INTO workflow.submission_event (
           id, submission_id, submission_revision_id, event_type,
           from_status, to_status, event_metadata
         ) VALUES ($1,$2,$3,'processing_started','submitted','processing',$4)`,
        [
          randomUUID(),
          submissionId,
          revisionId,
          { source: "processing_worker" },
        ],
      );
    } else if (
      !["processing", "ready_for_review"].includes(submission.status)
    ) {
      throw new Error("Submission is not eligible for processing");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadProcessingSourceFiles(
  database: Queryable,
  submissionId: string,
  revisionId: string,
): Promise<ProcessingSourceFile[]> {
  const result = await database.query<
    {
      audio_file_id: string;
      asset_id: string;
      submission_id: string;
      revision_id: string;
      track_id: string;
      owner_user_id: string;
      asset_role: "master" | "stem";
      stem_type: string | null;
      display_title: string | null;
      original_filename: string;
      storage_backend: "local" | "onedrive" | null;
      storage_key: string | null;
      provider_drive_id: string | null;
      provider_item_id: string | null;
      byte_size: number | string | null;
    } & QueryResultRow
  >(
    `SELECT audio_file.id AS audio_file_id, asset.id AS asset_id,
            submission.id AS submission_id, revision.id AS revision_id,
            submission.track_id, submission.owner_user_id,
            asset.asset_role, asset.stem_type, asset.display_title,
            audio_file.original_filename, audio_file.storage_backend,
            audio_file.storage_key, upload.provider_drive_id,
            upload.provider_item_id, audio_file.byte_size
     FROM workflow.submission submission
     JOIN workflow.submission_revision revision
       ON revision.id = submission.current_revision_id
     JOIN catalog.audio_asset asset
       ON asset.submission_revision_id = revision.id
     JOIN catalog.audio_file audio_file
       ON audio_file.audio_asset_id = asset.id AND audio_file.file_role = 'source'
     LEFT JOIN workflow.upload_session upload
       ON upload.audio_file_id = audio_file.id
     WHERE submission.id = $1 AND revision.id = $2
       AND audio_file.technical_status = 'available'
     ORDER BY CASE WHEN asset.asset_role = 'master' THEN 0 ELSE 1 END,
              asset.sort_order, audio_file.created_at`,
    [submissionId, revisionId],
  );
  return result.rows.map((row) => {
    if (!row.storage_backend || !row.storage_key || !row.byte_size) {
      throw new Error("A verified source storage object is missing");
    }
    return {
      audioFileId: row.audio_file_id,
      assetId: row.asset_id,
      submissionId: row.submission_id,
      submissionRevisionId: row.revision_id,
      trackId: row.track_id,
      ownerUserId: row.owner_user_id,
      assetRole: row.asset_role,
      stemType: row.stem_type,
      displayTitle: row.display_title || row.original_filename,
      originalFilename: row.original_filename,
      storageBackend: row.storage_backend,
      storageKey: row.storage_key,
      providerDriveId: row.provider_drive_id,
      providerItemId: row.provider_item_id,
      byteSize: Number(row.byte_size),
      extension: row.original_filename.toLowerCase().endsWith(".wav")
        ? ".wav"
        : ".mp3",
    };
  });
}

export async function clearTechnicalIssues(
  database: Queryable,
  revisionId: string,
): Promise<void> {
  await database.query(
    `DELETE FROM analysis.qc_issue
     WHERE submission_revision_id = $1`,
    [revisionId],
  );
}

export async function findAudioFileIdsByChecksum(
  database: Queryable,
  sha256: string,
): Promise<string[]> {
  const result = await database.query<{ id: string } & QueryResultRow>(
    `SELECT id FROM catalog.audio_file
     WHERE checksum_sha256 = $1 ORDER BY id LIMIT 21`,
    [sha256],
  );
  return result.rows.map((row) => row.id);
}

export async function persistTechnicalResult(
  pool: Pool,
  result: PersistedTechnicalResult,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO analysis.file_technical_result (
         audio_file_id, submission_revision_id, asset_id, asset_role,
         stem_type, sha256, duration_ms, container_format, codec,
         bit_rate_bps, sample_rate_hz, bit_depth, channels, channel_layout,
         integrated_loudness_lufs, loudness_range_lu, true_peak_dbtp,
         sample_peak_dbfs, leading_silence_ms, trailing_silence_ms,
         embedded_tags, tool_versions, processed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
         $18,$19,$20,$21,$22,now()
       )
       ON CONFLICT (audio_file_id) DO UPDATE SET
         submission_revision_id = EXCLUDED.submission_revision_id,
         asset_id = EXCLUDED.asset_id, asset_role = EXCLUDED.asset_role,
         stem_type = EXCLUDED.stem_type, sha256 = EXCLUDED.sha256,
         duration_ms = EXCLUDED.duration_ms,
         container_format = EXCLUDED.container_format, codec = EXCLUDED.codec,
         bit_rate_bps = EXCLUDED.bit_rate_bps,
         sample_rate_hz = EXCLUDED.sample_rate_hz,
         bit_depth = EXCLUDED.bit_depth, channels = EXCLUDED.channels,
         channel_layout = EXCLUDED.channel_layout,
         integrated_loudness_lufs = EXCLUDED.integrated_loudness_lufs,
         loudness_range_lu = EXCLUDED.loudness_range_lu,
         true_peak_dbtp = EXCLUDED.true_peak_dbtp,
         sample_peak_dbfs = EXCLUDED.sample_peak_dbfs,
         leading_silence_ms = EXCLUDED.leading_silence_ms,
         trailing_silence_ms = EXCLUDED.trailing_silence_ms,
         embedded_tags = EXCLUDED.embedded_tags,
         tool_versions = EXCLUDED.tool_versions, processed_at = now()`,
      [
        result.source.audioFileId,
        result.source.submissionRevisionId,
        result.source.assetId,
        result.source.assetRole,
        result.source.stemType,
        result.sha256,
        result.probe.durationMs,
        result.probe.containerFormat,
        result.probe.codec,
        result.probe.bitRateBps,
        result.probe.sampleRateHz,
        result.probe.bitDepth,
        result.probe.channels,
        result.probe.channelLayout,
        result.measurements.integratedLoudnessLufs,
        result.measurements.loudnessRangeLu,
        result.measurements.truePeakDbtp,
        result.measurements.samplePeakDbfs,
        result.measurements.leadingSilenceMs,
        result.measurements.trailingSilenceMs,
        result.probe.embeddedTags,
        result.toolVersions,
      ],
    );
    await client.query(
      `UPDATE catalog.audio_file
       SET checksum_sha256 = $2, duration_ms = $3,
           container_format = $4, codec = $5, sample_rate_hz = $6,
           bit_depth = $7, channels = $8,
           integrated_loudness_lufs = $9, loudness_range_lu = $10,
           true_peak_dbtp = $11
       WHERE id = $1`,
      [
        result.source.audioFileId,
        result.sha256,
        result.probe.durationMs,
        result.probe.containerFormat,
        result.probe.codec,
        result.probe.sampleRateHz,
        result.probe.bitDepth,
        result.probe.channels,
        result.measurements.integratedLoudnessLufs,
        result.measurements.loudnessRangeLu,
        result.measurements.truePeakDbtp,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertQcIssues(
  database: Queryable,
  revisionId: string,
  issues: TechnicalQcIssue[],
): Promise<void> {
  for (const issue of issues) {
    await database.query(
      `INSERT INTO analysis.qc_issue (
         id, submission_revision_id, audio_file_id, code,
         severity, message, details
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (
         submission_revision_id,
         COALESCE(audio_file_id, '00000000-0000-0000-0000-000000000000'::uuid),
         code
       ) DO UPDATE SET severity = EXCLUDED.severity,
                       message = EXCLUDED.message,
                       details = EXCLUDED.details`,
      [
        randomUUID(),
        revisionId,
        issue.audioFileId,
        issue.code,
        issue.severity,
        issue.message,
        issue.details,
      ],
    );
  }
}

export async function markTechnicalComplete(
  database: Queryable,
  revisionId: string,
): Promise<void> {
  await database.query(
    `UPDATE analysis.revision_analysis
     SET technical_status = 'complete', technical_completed_at = now(),
         row_version = row_version + 1, last_error_code = NULL,
         last_error_message = NULL
     WHERE submission_revision_id = $1`,
    [revisionId],
  );
  await database.query(
    `UPDATE rights.copyright_check
     SET status='ready',row_version=row_version+1,
         last_error_code=NULL,last_error_message=NULL
     WHERE submission_revision_id=$1 AND is_current
       AND status IN ('not_started','awaiting_technical')`,
    [revisionId],
  );
}

export async function markTechnicalFailed(
  database: Queryable,
  revisionId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await database.query(
    `UPDATE analysis.revision_analysis
     SET technical_status = 'failed', overall_status = 'failed',
         last_error_code = $2, last_error_message = $3,
         completed_at = now(), row_version = row_version + 1
     WHERE submission_revision_id = $1`,
    [revisionId, errorCode.slice(0, 100), errorMessage.slice(0, 500)],
  );
  await database.query(
    `UPDATE rights.copyright_check
     SET status='awaiting_technical',last_error_code='TECHNICAL_PROCESSING_FAILED',
         last_error_message='Technical processing must succeed before a test batch can be built',
         row_version=row_version+1
     WHERE submission_revision_id=$1 AND is_current
       AND status IN ('not_started','awaiting_technical','ready')`,
    [revisionId],
  );
}

export async function finalizeRevisionForReview(
  pool: Pool,
  input: {
    submissionId: string;
    revisionId: string;
    overallStatus: "complete" | "partial";
    aiStatus:
      "disabled" | "complete" | "failed" | "skipped_unsupported_duration";
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE analysis.revision_analysis
       SET overall_status = $2, ai_status = $3,
           provider_completed_at = CASE WHEN $3 <> 'disabled' THEN now() ELSE provider_completed_at END,
           completed_at = now(), row_version = row_version + 1
       WHERE submission_revision_id = $1 AND technical_status = 'complete'`,
      [input.revisionId, input.overallStatus, input.aiStatus],
    );
    const transitioned = await client.query(
      `UPDATE workflow.submission
       SET status = 'ready_for_review', row_version = row_version + 1
       WHERE id = $1 AND current_revision_id = $2 AND status = 'processing'`,
      [input.submissionId, input.revisionId],
    );
    if (transitioned.rowCount === 1) {
      await client.query(
        `INSERT INTO workflow.submission_event (
           id, submission_id, submission_revision_id, event_type,
           from_status, to_status, event_metadata
         ) VALUES ($1,$2,$3,'ready_for_review','processing','ready_for_review',$4)`,
        [
          randomUUID(),
          input.submissionId,
          input.revisionId,
          { analysisStatus: input.overallStatus },
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getSubmissionProcessingOwner(
  database: Queryable,
  submissionId: string,
): Promise<{ ownerUserId: string; revisionId: string; status: string } | null> {
  const result = await database.query<
    {
      owner_user_id: string;
      current_revision_id: string;
      status: string;
    } & QueryResultRow
  >(
    `SELECT owner_user_id, current_revision_id, status
     FROM workflow.submission WHERE id = $1 LIMIT 1`,
    [submissionId],
  );
  const row = result.rows[0];
  return row
    ? {
        ownerUserId: row.owner_user_id,
        revisionId: row.current_revision_id,
        status: row.status,
      }
    : null;
}

export async function retryRevisionProcessing(
  pool: Pool,
  input: {
    submissionId: string;
    revisionId: string;
    maxAttempts: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE analysis.revision_analysis
       SET technical_status = 'pending', ai_status = 'not_started',
           overall_status = 'queued', last_error_code = NULL,
           last_error_message = NULL, completed_at = NULL,
           row_version = row_version + 1
       WHERE submission_revision_id = $1 AND overall_status = 'failed'`,
      [input.revisionId],
    );
    await client.query(
      `UPDATE analysis.processing_job
       SET status = 'queued', attempt_count = 0, next_attempt_at = now(),
           lease_owner = NULL, lease_expires_at = NULL,
           last_error_code = NULL, last_error_message = NULL,
           completed_at = NULL
       WHERE idempotency_key = $1 AND status = 'failed'`,
      [`revision:${input.revisionId}:processing`],
    );
    await enqueueProcessingJob(client, {
      jobType: "revision_processing",
      submissionId: input.submissionId,
      submissionRevisionId: input.revisionId,
      idempotencyKey: `revision:${input.revisionId}:processing`,
      maxAttempts: input.maxAttempts,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findMissingProcessingJobs(
  database: Queryable,
): Promise<Array<{ submissionId: string; revisionId: string }>> {
  const result = await database.query<
    { submission_id: string; revision_id: string } & QueryResultRow
  >(
    `SELECT submission.id AS submission_id,
            submission.current_revision_id AS revision_id
     FROM workflow.submission submission
     WHERE submission.status IN ('submitted', 'processing')
       AND submission.current_revision_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM analysis.processing_job job
         WHERE job.submission_revision_id = submission.current_revision_id
           AND job.job_type = 'revision_processing'
       )
     ORDER BY submission.created_at, submission.id`,
  );
  return result.rows.map((row) => ({
    submissionId: row.submission_id,
    revisionId: row.revision_id,
  }));
}

export async function loadProcessingAnalysis(
  database: Queryable,
  revisionId: string,
): Promise<ProcessingAnalysisDto | null> {
  const analysisResult = await database.query<
    {
      id: string;
      submission_revision_id: string;
      track_id: string;
      technical_status: ProcessingAnalysisDto["technicalStatus"];
      ai_status: ProcessingAnalysisDto["aiStatus"];
      overall_status: ProcessingAnalysisDto["overallStatus"];
      last_error_code: string | null;
      last_error_message: string | null;
      started_at: Date | string | null;
      completed_at: Date | string | null;
      normalized_result: NormalizedAnalysisResult | null;
      suggestion_count: string;
    } & QueryResultRow
  >(
    `SELECT revision_analysis.*,
            provider.normalized_result,
            (SELECT count(*)::text FROM analysis.metadata_suggestion suggestion
             WHERE suggestion.submission_revision_id = revision_analysis.submission_revision_id) AS suggestion_count
     FROM analysis.revision_analysis revision_analysis
     LEFT JOIN analysis.provider_run provider
       ON provider.submission_revision_id = revision_analysis.submission_revision_id
      AND provider.provider = 'ai_metadata'
     WHERE revision_analysis.submission_revision_id = $1 LIMIT 1`,
    [revisionId],
  );
  const row = analysisResult.rows[0];
  if (!row) return null;
  const issueResult = await database.query<
    {
      id: string;
      audio_file_id: string | null;
      code: string;
      severity: QcIssueDto["severity"];
      message: string;
      details: Record<string, unknown>;
    } & QueryResultRow
  >(
    `SELECT id, audio_file_id, code, severity, message, details
     FROM analysis.qc_issue WHERE submission_revision_id = $1
     ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
              created_at, id`,
    [revisionId],
  );
  const issues: QcIssueDto[] = issueResult.rows.map((issue) => ({
    id: issue.id,
    audioFileId: issue.audio_file_id,
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    details: issue.details,
  }));
  const technical = await database.query<
    {
      audio_file_id: string;
      asset_role: "master" | "stem";
      stem_type: string | null;
      display_title: string | null;
      original_filename: string;
      sha256: string;
      duration_ms: number | string;
      container_format: string;
      codec: string;
      bit_rate_bps: number | string | null;
      sample_rate_hz: number | null;
      bit_depth: number | null;
      channels: number | null;
      channel_layout: string | null;
      integrated_loudness_lufs: number | string | null;
      loudness_range_lu: number | string | null;
      true_peak_dbtp: number | string | null;
      sample_peak_dbfs: number | string | null;
      leading_silence_ms: number | string | null;
      trailing_silence_ms: number | string | null;
      embedded_tags: Record<string, string>;
    } & QueryResultRow
  >(
    `SELECT result.*, asset.display_title, audio_file.original_filename
     FROM analysis.file_technical_result result
     JOIN catalog.audio_asset asset ON asset.id = result.asset_id
     JOIN catalog.audio_file audio_file ON audio_file.id = result.audio_file_id
     WHERE result.submission_revision_id = $1
     ORDER BY CASE result.asset_role WHEN 'master' THEN 0 ELSE 1 END,
              asset.sort_order, result.audio_file_id`,
    [revisionId],
  );
  const toNumber = (value: number | string | null): number | null =>
    value == null ? null : Number(value);
  const technicalResults: FileTechnicalResultDto[] = technical.rows.map(
    (item) => ({
      audioFileId: item.audio_file_id,
      assetRole: item.asset_role,
      stemType: item.stem_type,
      displayTitle: item.display_title || item.original_filename,
      originalFilename: item.original_filename,
      sha256: item.sha256,
      durationMs: Number(item.duration_ms),
      containerFormat: item.container_format,
      codec: item.codec,
      bitRateBps: toNumber(item.bit_rate_bps),
      sampleRateHz: item.sample_rate_hz,
      bitDepth: item.bit_depth,
      channels: item.channels,
      channelLayout: item.channel_layout,
      integratedLoudnessLufs: toNumber(item.integrated_loudness_lufs),
      loudnessRangeLu: toNumber(item.loudness_range_lu),
      truePeakDbtp: toNumber(item.true_peak_dbtp),
      samplePeakDbfs: toNumber(item.sample_peak_dbfs),
      leadingSilenceMs: toNumber(item.leading_silence_ms),
      trailingSilenceMs: toNumber(item.trailing_silence_ms),
      embeddedTags: item.embedded_tags,
      issues: issues.filter(
        (issue) => issue.audioFileId === item.audio_file_id,
      ),
    }),
  );
  return {
    id: row.id,
    submissionRevisionId: row.submission_revision_id,
    trackId: row.track_id,
    technicalStatus: row.technical_status,
    aiStatus: row.ai_status,
    overallStatus: row.overall_status,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
    technicalResults,
    issues,
    normalizedAiResult: row.normalized_result,
    suggestionCount: Number(row.suggestion_count),
  };
}
