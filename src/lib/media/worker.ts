import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { QueryResultRow } from "pg";

import { calculateFileSha256 } from "@/lib/audio/checksum";
import { getDatabase } from "@/lib/database/database";
import { createStorageProviderForKind } from "@/lib/storage/factory";
import { parseMediaConfig } from "./config";
import { buildStoredPackage } from "./packages";
import { createPlaybackPreview, extractWaveformPeaks } from "./preview";
import { listPublishedPackageSources } from "./repository";

interface ClaimedJob extends QueryResultRow {
  id: string;
  job_type: "preview" | "package";
  playback_artifact_id: string | null;
  download_package_id: string | null;
  attempt_count: number;
  max_attempts: number;
}

async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  const database = getDatabase();
  const config = parseMediaConfig();
  const result = await database.query<ClaimedJob>(
    `UPDATE media.delivery_job job
     SET status='running',attempt_count=attempt_count+1,lease_owner=$1,
         lease_expires_at=now()+($2::text || ' milliseconds')::interval
     WHERE job.id=(
       SELECT candidate.id
       FROM media.delivery_job candidate
       WHERE candidate.status='queued' AND candidate.available_at <= now()
       ORDER BY candidate.available_at,candidate.created_at,candidate.id
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     RETURNING job.*`,
    [workerId, config.jobLeaseMs],
  );
  return result.rows[0] ?? null;
}

async function finishJob(jobId: string) {
  await getDatabase().query(
    `UPDATE media.delivery_job
     SET status='succeeded',lease_owner=NULL,lease_expires_at=NULL,
         completed_at=now(),last_error_code=NULL,last_error_message=NULL
     WHERE id=$1`,
    [jobId],
  );
}

async function failJob(job: ClaimedJob, error: unknown) {
  const exhausted = job.attempt_count >= job.max_attempts;
  const message =
    error instanceof Error ? error.message.slice(0, 1_000) : "Media job failed";
  await getDatabase().query(
    `UPDATE media.delivery_job
     SET status=$2,lease_owner=NULL,lease_expires_at=NULL,
         available_at=now()+make_interval(secs => LEAST(300,POWER(2,attempt_count)::int)),
         last_error_code='MEDIA_JOB_FAILED',last_error_message=$3
     WHERE id=$1`,
    [job.id, exhausted ? "failed" : "queued", message],
  );
  if (job.playback_artifact_id) {
    await getDatabase().query(
      `UPDATE media.playback_artifact
       SET status=$2,last_error_code='PREVIEW_FAILED',last_error_message=$3
       WHERE id=$1`,
      [job.playback_artifact_id, exhausted ? "failed" : "queued", message],
    );
  }
  if (job.download_package_id && exhausted) {
    await getDatabase().query(
      `UPDATE media.download_package
       SET status='failed',last_error_code='PACKAGE_FAILED',last_error_message=$2
       WHERE id=$1`,
      [job.download_package_id, message],
    );
  }
}

async function processPreview(job: ClaimedJob) {
  const config = parseMediaConfig();
  const result = await getDatabase().query<
    {
      artifact_id: string;
      audio_asset_id: string;
      source_audio_file_id: string;
      storage_backend: "local" | "onedrive";
      storage_key: string;
      provider_drive_id: string | null;
      provider_item_id: string | null;
      original_filename: string;
    } & QueryResultRow
  >(
    `SELECT artifact.id AS artifact_id,artifact.audio_asset_id,
            artifact.source_audio_file_id,source.storage_backend,
            source.storage_key,upload.provider_drive_id,upload.provider_item_id,
            source.original_filename
     FROM media.playback_artifact artifact
     JOIN catalog.audio_file source ON source.id=artifact.source_audio_file_id
     LEFT JOIN workflow.upload_session upload ON upload.audio_file_id=source.id
     WHERE artifact.id=$1 AND artifact.status IN ('queued','building')
       AND source.file_role='source' AND source.technical_status='available'`,
    [job.playback_artifact_id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Playback artifact source is unavailable");
  await getDatabase().query(
    "UPDATE media.playback_artifact SET status='building' WHERE id=$1",
    [row.artifact_id],
  );
  const workRoot = path.join(config.tempRoot, row.artifact_id);
  const sourcePath = path.join(
    workRoot,
    `source${path.extname(row.original_filename)}`,
  );
  const previewPath = path.join(workRoot, "preview.mp3");
  await mkdir(workRoot, { recursive: true, mode: 0o700 });
  try {
    const provider = createStorageProviderForKind(row.storage_backend);
    await provider.materializeStoredObject({
      storageKey: row.storage_key,
      providerDriveId: row.provider_drive_id,
      providerItemId: row.provider_item_id,
      destinationPath: sourcePath,
    });
    const { preview } = await createPlaybackPreview(
      sourcePath,
      previewPath,
      config,
    );
    const waveformPeaks = await extractWaveformPeaks(
      sourcePath,
      preview.durationMs,
      config,
    );
    const byteSize = (await stat(previewPath)).size;
    const checksum = await calculateFileSha256(previewPath);
    const storageKey = `generated/previews/${row.artifact_id}.mp3`;
    const stored = await provider.storeGeneratedObject({
      storageKey,
      sourcePath: previewPath,
      contentType: "audio/mpeg",
      expectedByteSize: byteSize,
    });
    const previewFileId = randomUUID();
    const client = await getDatabase().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO catalog.audio_file
           (id,audio_asset_id,file_role,original_filename,storage_backend,
            storage_key,content_type,container_format,codec,byte_size,
            checksum_sha256,duration_ms,sample_rate_hz,channels,technical_status)
         VALUES ($1,$2,'preview',$3,$4,$5,'audio/mpeg','mp3','mp3',$6,$7,$8,$9,$10,'available')`,
        [
          previewFileId,
          row.audio_asset_id,
          `soundvault-preview-${row.artifact_id}.mp3`,
          stored.storageBackend,
          stored.storageKey,
          byteSize,
          checksum,
          preview.durationMs,
          preview.sampleRateHz,
          preview.channels,
        ],
      );
      await client.query(
        `UPDATE media.playback_artifact
         SET preview_audio_file_id=$2,preview_provider_drive_id=$3,
             preview_provider_item_id=$4,status='ready',
             waveform_peaks=$5,waveform_peak_count=$6,ready_at=now(),
             last_error_code=NULL,last_error_message=NULL
         WHERE id=$1`,
        [
          row.artifact_id,
          previewFileId,
          stored.providerDriveId ?? null,
          stored.providerItemId ?? null,
          waveformPeaks,
          config.waveformPeakCount,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      await provider.deleteGeneratedObject({
        storageKey: stored.storageKey,
        providerDriveId: stored.providerDriveId,
        providerItemId: stored.providerItemId,
      });
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

async function processPackage(job: ClaimedJob) {
  const config = parseMediaConfig();
  const result = await getDatabase().query<
    {
      id: string;
      track_id: string;
      scope: "stems" | "full";
      submission_revision_id: string;
    } & QueryResultRow
  >(
    `UPDATE media.download_package
     SET status='building'
     WHERE id=$1 AND status IN ('queued','building')
     RETURNING id,track_id,scope,submission_revision_id`,
    [job.download_package_id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Download package is unavailable");
  const subject = await listPublishedPackageSources(
    getDatabase(),
    row.track_id,
    row.scope,
  );
  if (!subject || subject.revisionId !== row.submission_revision_id) {
    throw new Error("Published package sources are no longer available");
  }
  const stored = await buildStoredPackage({
    packageId: row.id,
    title: subject.title,
    scope: row.scope,
    revisionId: subject.revisionId,
    publishedAt: subject.publishedAt,
    sources: subject.sources,
    tempRoot: config.tempRoot,
    config,
  });
  await getDatabase().query(
    `UPDATE media.download_package
     SET status='ready',storage_backend=$2,storage_key=$3,
         provider_drive_id=$4,provider_item_id=$5,byte_size=$6,
         checksum_sha256=$7,ready_at=now(),
         expires_at=now()+($8::text || ' hours')::interval,
         last_error_code=NULL,last_error_message=NULL
     WHERE id=$1`,
    [
      row.id,
      stored.storageBackend,
      stored.storageKey,
      stored.providerDriveId ?? null,
      stored.providerItemId ?? null,
      stored.byteSize,
      stored.checksumSha256,
      config.packageRetentionHours,
    ],
  );
}

export async function runOneMediaJob(workerId = `media-${process.pid}`) {
  const job = await claimJob(workerId);
  if (!job) return { processed: false };
  try {
    if (job.job_type === "preview") await processPreview(job);
    else await processPackage(job);
    await finishJob(job.id);
    return { processed: true, jobId: job.id, type: job.job_type };
  } catch (error) {
    await failJob(job, error);
    throw error;
  }
}

export async function reconcileMediaJobs() {
  const database = getDatabase();
  const config = parseMediaConfig();
  const leases = await database.query(
    `UPDATE media.delivery_job
     SET status=CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'queued' END,
         lease_owner=NULL,lease_expires_at=NULL,available_at=now()
     WHERE status='running' AND lease_expires_at <= now()`,
  );
  const published = await database.query<
    { track_id: string; revision_id: string } & QueryResultRow
  >(
    `SELECT id AS track_id,published_revision_id AS revision_id
     FROM catalog.track WHERE publication_status='published'`,
  );
  const { enqueuePlaybackArtifacts } = await import("./repository");
  let enqueued = 0;
  for (const row of published.rows) {
    enqueued += await enqueuePlaybackArtifacts(database, {
      trackId: row.track_id,
      revisionId: row.revision_id,
      profileVersion: config.profileVersion,
      maxAttempts: config.jobMaxRetries,
    });
  }
  return { recoveredLeases: leases.rowCount ?? 0, scannedAssets: enqueued };
}
