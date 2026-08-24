import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { CurrentUser } from "@/types/auth";
import type {
  CopyrightBatchDto,
  CopyrightBatchListItem,
  CopyrightCheckListItem,
  CopyrightObservationType,
  CopyrightSummaryDto,
} from "@/types/copyright";

import { assessDeclaredEligibility } from "./eligibility";
import type { EligibilityChecklist } from "./eligibility";
import { assessChecklist } from "./eligibility";
import { buildCopyrightManifest } from "./manifest";
import type { ManifestSource } from "./manifest";
import { observationInputSchema, youtubeVideoIdSchema } from "./validation";

type Queryable = Pick<Pool | PoolClient, "query">;

export interface CopyrightBuildSource extends ManifestSource {
  batchItemId: string;
  copyrightCheckId: string;
  audioFileId: string;
  storageKey: string;
  providerDriveId: string | null;
  providerItemId: string | null;
  byteSize: number;
  extension: ".wav" | ".mp3";
}

export interface CopyrightJob {
  id: string;
  batchId: string;
  attemptCount: number;
  maxAttempts: number;
}

async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reconcileCopyrightChecks(
  pool: Pool,
  actorUserId: string | null = null,
): Promise<{ created: number; refreshed: number }> {
  const candidates = await pool.query<
    {
      revision_id: string;
      track_id: string;
      asset_kind: string;
      master_rights_basis: string | null;
      composition_rights_basis: string | null;
      technical_status: string | null;
    } & QueryResultRow
  >(
    `SELECT revision.id AS revision_id, submission.track_id, track.asset_kind,
            declaration.master_rights_basis, declaration.composition_rights_basis,
            analysis.technical_status
     FROM workflow.submission submission
     JOIN workflow.submission_revision revision
       ON revision.id = submission.current_revision_id
     JOIN catalog.track track ON track.id = submission.track_id
     LEFT JOIN rights.rights_declaration declaration
       ON declaration.submission_revision_id = revision.id
     LEFT JOIN analysis.revision_analysis analysis
       ON analysis.submission_revision_id = revision.id
     WHERE submission.status IN ('submitted', 'processing', 'ready_for_review')`,
  );
  let created = 0;
  let refreshed = 0;
  for (const candidate of candidates.rows) {
    const eligibility = assessDeclaredEligibility({
      masterRightsBasis: candidate.master_rights_basis,
      compositionRightsBasis: candidate.composition_rights_basis,
      assetKind: candidate.asset_kind,
    });
    const status =
      candidate.technical_status === "complete"
        ? "ready"
        : "awaiting_technical";
    const inserted = await pool.query(
      `INSERT INTO rights.copyright_check (
         id, submission_revision_id, track_id, status, eligibility_status,
         readiness_status, created_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (submission_revision_id) WHERE is_current DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        candidate.revision_id,
        candidate.track_id,
        status,
        eligibility,
        eligibility === "ineligible"
          ? "ineligible"
          : eligibility === "needs_rights_review"
            ? "needs_rights_review"
            : eligibility === "needs_policy_review"
              ? "needs_policy_review"
              : "not_assessed",
        actorUserId,
      ],
    );
    if (inserted.rowCount) {
      created += 1;
      await pool.query(
        `INSERT INTO rights.copyright_check_event (
           id, copyright_check_id, actor_user_id, event_type, event_metadata
         ) VALUES ($1,$2,$3,'copyright_check_created',$4)`,
        [
          randomUUID(),
          inserted.rows[0].id,
          actorUserId,
          { source: "reconcile" },
        ],
      );
      continue;
    }
    const update = await pool.query(
      `UPDATE rights.copyright_check
       SET status = CASE
             WHEN status IN ('not_started','awaiting_technical','ready') THEN $2
             ELSE status END,
           row_version = row_version + 1
       WHERE submission_revision_id = $1 AND is_current
         AND status IS DISTINCT FROM CASE
           WHEN status IN ('not_started','awaiting_technical','ready') THEN $2
           ELSE status END`,
      [candidate.revision_id, status],
    );
    refreshed += update.rowCount ?? 0;
  }
  return { created, refreshed };
}

function mapCheck(row: Record<string, unknown>): CopyrightCheckListItem {
  return {
    id: String(row.id),
    submissionId: String(row.submission_id),
    submissionRevisionId: String(row.submission_revision_id),
    trackId: String(row.track_id),
    title: String(row.title),
    ownerName: String(row.owner_name),
    revisionNumber: Number(row.revision_number),
    technicalStatus: String(row.technical_status ?? "pending"),
    status: row.status as CopyrightCheckListItem["status"],
    outcome: (row.outcome as CopyrightCheckListItem["outcome"]) ?? null,
    eligibilityStatus:
      row.eligibility_status as CopyrightCheckListItem["eligibilityStatus"],
    readinessStatus:
      row.readiness_status as CopyrightCheckListItem["readinessStatus"],
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

const CHECK_LIST_SELECT = `
  SELECT check_record.*, submission.id AS submission_id,
         revision.revision_number, COALESCE(track.title, 'Untitled Track') AS title,
         COALESCE(team_access.display_name, owner.name, owner.email) AS owner_name,
         analysis.technical_status, submission.owner_user_id
  FROM rights.copyright_check check_record
  JOIN workflow.submission_revision revision
    ON revision.id = check_record.submission_revision_id
  JOIN workflow.submission submission
    ON submission.id = revision.submission_id
  JOIN catalog.track track ON track.id = check_record.track_id
  JOIN auth."user" owner ON owner.id = submission.owner_user_id
  LEFT JOIN auth.team_access team_access ON team_access.auth_user_id = owner.id
  LEFT JOIN analysis.revision_analysis analysis
    ON analysis.submission_revision_id = revision.id`;

export async function listCopyrightChecks(
  database: Queryable,
  user: Pick<CurrentUser, "id" | "role">,
): Promise<CopyrightCheckListItem[]> {
  if (user.role === "user") return [];
  const result = await database.query<Record<string, unknown> & QueryResultRow>(
    `${CHECK_LIST_SELECT}
     WHERE check_record.is_current
       AND ($1::boolean OR submission.owner_user_id = $2)
     ORDER BY check_record.updated_at DESC, check_record.id`,
    [user.role === "admin" || user.role === "coordinator", user.id],
  );
  return result.rows.map(mapCheck);
}

export async function getCopyrightSummary(
  database: Queryable,
  revisionId: string,
  ownerUserId: string,
  user: Pick<CurrentUser, "id" | "role">,
): Promise<CopyrightSummaryDto | null> {
  if (
    user.role === "user" ||
    (user.role === "music_producer" && user.id !== ownerUserId)
  )
    return null;
  const result = await database.query<Record<string, unknown> & QueryResultRow>(
    `SELECT status, outcome, eligibility_status, readiness_status, updated_at
     FROM rights.copyright_check
     WHERE submission_revision_id = $1 AND is_current`,
    [revisionId],
  );
  const row = result.rows[0];
  return row
    ? {
        status: row.status as CopyrightSummaryDto["status"],
        outcome: (row.outcome as CopyrightSummaryDto["outcome"]) ?? null,
        eligibilityStatus:
          row.eligibility_status as CopyrightSummaryDto["eligibilityStatus"],
        readinessStatus:
          row.readiness_status as CopyrightSummaryDto["readinessStatus"],
        updatedAt: new Date(row.updated_at as string | Date).toISOString(),
      }
    : null;
}

export async function createCopyrightBatch(
  pool: Pool,
  input: {
    checkIds: readonly string[];
    actorUserId: string;
    maxTracks: number;
    maxDurationMs: number;
    gapMs: number;
    retentionDays: number;
  },
): Promise<string> {
  const uniqueIds = [...new Set(input.checkIds)];
  if (!uniqueIds.length) throw new Error("Select at least one Track");
  if (uniqueIds.length > input.maxTracks)
    throw new Error(`A batch may contain at most ${input.maxTracks} Tracks`);
  return withTransaction(pool, async (client) => {
    const result = await client.query<
      (CopyrightBuildSource & QueryResultRow) & {
        submission_id: string;
        submission_revision_id: string;
        track_id: string;
        check_id: string;
        audio_file_id: string;
        source_sha256: string;
        duration_ms: number | string;
        storage_key: string;
        provider_drive_id: string | null;
        provider_item_id: string | null;
        byte_size: number | string;
        original_filename: string;
      }
    >(
      `SELECT check_record.id AS check_id, submission.id AS submission_id,
              revision.id AS submission_revision_id, submission.track_id,
              COALESCE(track.title, 'Untitled Track') AS title,
              audio_file.id AS audio_file_id, technical.sha256 AS source_sha256,
              technical.duration_ms, audio_file.storage_key,
              upload.provider_drive_id, upload.provider_item_id,
              audio_file.byte_size, audio_file.original_filename
       FROM rights.copyright_check check_record
       JOIN workflow.submission_revision revision
         ON revision.id = check_record.submission_revision_id
       JOIN workflow.submission submission ON submission.id = revision.submission_id
         AND submission.current_revision_id = revision.id
       JOIN catalog.track track ON track.id = submission.track_id
       JOIN analysis.revision_analysis analysis
         ON analysis.submission_revision_id = revision.id
         AND analysis.technical_status = 'complete'
       JOIN catalog.audio_asset asset
         ON asset.submission_revision_id = revision.id AND asset.asset_role = 'master'
       JOIN catalog.audio_file audio_file
         ON audio_file.audio_asset_id = asset.id AND audio_file.file_role = 'source'
         AND audio_file.technical_status = 'available'
       JOIN analysis.file_technical_result technical
         ON technical.audio_file_id = audio_file.id
       LEFT JOIN workflow.upload_session upload ON upload.audio_file_id = audio_file.id
       WHERE check_record.id = ANY($1::uuid[]) AND check_record.is_current
         AND check_record.status IN ('ready','not_started')
       ORDER BY check_record.created_at, check_record.id
       FOR UPDATE OF check_record`,
      [uniqueIds],
    );
    if (result.rows.length !== uniqueIds.length)
      throw new Error(
        "Every selected Track needs a current Master and completed technical processing",
      );
    const sources: CopyrightBuildSource[] = result.rows.map((row) => {
      if (!row.storage_key || !row.byte_size)
        throw new Error(
          "A selected Master is missing private storage metadata",
        );
      return {
        batchItemId: randomUUID(),
        copyrightCheckId: row.check_id,
        audioFileId: row.audio_file_id,
        submissionId: row.submission_id,
        submissionRevisionId: row.submission_revision_id,
        trackId: row.track_id,
        title: row.title,
        sha256: row.source_sha256,
        durationMs: Number(row.duration_ms),
        storageKey: row.storage_key,
        providerDriveId: row.provider_drive_id,
        providerItemId: row.provider_item_id,
        byteSize: Number(row.byte_size),
        extension: row.original_filename.toLowerCase().endsWith(".wav")
          ? ".wav"
          : ".mp3",
      };
    });
    const batchId = randomUUID();
    const manifest = buildCopyrightManifest(batchId, sources, input.gapMs);
    if (manifest.totalDurationMs > input.maxDurationMs)
      throw new Error(
        "The selected Tracks exceed the batch duration limit and must be split",
      );
    await client.query(
      `INSERT INTO rights.copyright_batch (
         id, total_duration_ms, gap_duration_ms, item_count, expires_at,
         created_by_user_id
       ) VALUES ($1,$2,$3,$4,now() + ($5::text || ' days')::interval,$6)`,
      [
        batchId,
        manifest.totalDurationMs,
        input.gapMs,
        sources.length,
        input.retentionDays,
        input.actorUserId,
      ],
    );
    for (const [index, source] of sources.entries()) {
      const item = manifest.items[index];
      if (!item) throw new Error("Batch manifest could not be constructed");
      await client.query(
        `INSERT INTO rights.copyright_batch_item (
           id, batch_id, copyright_check_id, submission_id,
           submission_revision_id, track_id, audio_file_id, sequence, title,
           source_sha256, start_ms, end_ms, duration_ms
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          source.batchItemId,
          batchId,
          source.copyrightCheckId,
          source.submissionId,
          source.submissionRevisionId,
          source.trackId,
          source.audioFileId,
          item.sequence,
          source.title,
          source.sha256,
          item.startMs,
          item.endMs,
          item.durationMs,
        ],
      );
    }
    await client.query(
      `UPDATE rights.copyright_check
       SET status='package_queued', row_version=row_version+1
       WHERE id = ANY($1::uuid[])`,
      [uniqueIds],
    );
    await client.query(
      `INSERT INTO rights.copyright_job (
         id, batch_id, idempotency_key
       ) VALUES ($1,$2,$3)`,
      [randomUUID(), batchId, `copyright-batch:${batchId}:build:v1`],
    );
    await client.query(
      `INSERT INTO rights.copyright_check_event (
         id, batch_id, actor_user_id, event_type, event_metadata
       ) VALUES ($1,$2,$3,'batch_created',$4)`,
      [randomUUID(), batchId, input.actorUserId, { itemCount: sources.length }],
    );
    return batchId;
  });
}

export async function claimNextCopyrightJob(
  pool: Pool,
  workerId: string,
  leaseMs: number,
  maxConcurrentBuilds = 1,
): Promise<CopyrightJob | null> {
  return withTransaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('soundvault.copyright.build'))",
    );
    const running = await client.query<{ count: string } & QueryResultRow>(
      `SELECT count(*)::text AS count FROM rights.copyright_job
       WHERE status='running' AND lease_expires_at > now()`,
    );
    if (Number(running.rows[0]?.count ?? 0) >= maxConcurrentBuilds) return null;
    const result = await client.query<Record<string, unknown> & QueryResultRow>(
      `UPDATE rights.copyright_job job
     SET status='running', attempt_count=attempt_count+1, lease_owner=$1,
         lease_expires_at=now()+($2::text || ' milliseconds')::interval,
         started_at=COALESCE(started_at,now()), last_error_code=NULL,
         last_error_message=NULL
     WHERE job.id = (
       SELECT candidate.id FROM rights.copyright_job candidate
       WHERE ((candidate.status IN ('queued','retry_wait')
               AND candidate.next_attempt_at <= now())
          OR (candidate.status='running' AND candidate.lease_expires_at <= now()))
         AND candidate.attempt_count < candidate.max_attempts
       ORDER BY candidate.next_attempt_at, candidate.created_at, candidate.id
       LIMIT 1 FOR UPDATE SKIP LOCKED
     ) RETURNING job.id, job.batch_id, job.attempt_count, job.max_attempts`,
      [workerId, leaseMs],
    );
    const row = result.rows[0];
    return row
      ? {
          id: String(row.id),
          batchId: String(row.batch_id),
          attemptCount: Number(row.attempt_count),
          maxAttempts: Number(row.max_attempts),
        }
      : null;
  });
}

export async function beginBatchBuild(
  pool: Pool,
  batchId: string,
): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `UPDATE rights.copyright_batch SET status='building'
       WHERE id=$1 AND status='queued'`,
      [batchId],
    );
    if ((result.rowCount ?? 0) === 0) return false;
    await client.query(
      `UPDATE rights.copyright_check SET status='package_building',row_version=row_version+1
       WHERE id IN (SELECT copyright_check_id FROM rights.copyright_batch_item WHERE batch_id=$1)
         AND status='package_queued'`,
      [batchId],
    );
    return true;
  });
}

export async function loadBatchBuildSources(
  database: Queryable,
  batchId: string,
): Promise<CopyrightBuildSource[]> {
  const result = await database.query<Record<string, unknown> & QueryResultRow>(
    `SELECT item.id AS batch_item_id, item.copyright_check_id,
            item.submission_id, item.submission_revision_id, item.track_id,
            item.title, item.source_sha256, item.duration_ms, item.audio_file_id,
            audio_file.storage_key, audio_file.byte_size,
            audio_file.original_filename, upload.provider_drive_id,
            upload.provider_item_id
     FROM rights.copyright_batch_item item
     JOIN catalog.audio_file audio_file ON audio_file.id=item.audio_file_id
     LEFT JOIN workflow.upload_session upload ON upload.audio_file_id=audio_file.id
     WHERE item.batch_id=$1 ORDER BY item.sequence`,
    [batchId],
  );
  return result.rows.map((row) => ({
    batchItemId: String(row.batch_item_id),
    copyrightCheckId: String(row.copyright_check_id),
    submissionId: String(row.submission_id),
    submissionRevisionId: String(row.submission_revision_id),
    trackId: String(row.track_id),
    title: String(row.title),
    sha256: String(row.source_sha256),
    durationMs: Number(row.duration_ms),
    audioFileId: String(row.audio_file_id),
    storageKey: String(row.storage_key),
    providerDriveId: row.provider_drive_id
      ? String(row.provider_drive_id)
      : null,
    providerItemId: row.provider_item_id ? String(row.provider_item_id) : null,
    byteSize: Number(row.byte_size),
    extension: String(row.original_filename).toLowerCase().endsWith(".wav")
      ? ".wav"
      : ".mp3",
  }));
}

export async function completeBatchBuild(
  pool: Pool,
  input: {
    jobId: string;
    workerId: string;
    batchId: string;
    artifactKey: string;
    manifestKey: string;
    artifactSha256: string;
  },
): Promise<void> {
  return withTransaction(pool, async (client) => {
    await client.query(
      `UPDATE rights.copyright_batch
       SET status='ready',artifact_key=$2,manifest_key=$3,artifact_sha256=$4
       WHERE id=$1 AND status='building'`,
      [
        input.batchId,
        input.artifactKey,
        input.manifestKey,
        input.artifactSha256,
      ],
    );
    await client.query(
      `UPDATE rights.copyright_check SET status='package_ready',row_version=row_version+1
       WHERE id IN (SELECT copyright_check_id FROM rights.copyright_batch_item WHERE batch_id=$1)
         AND status='package_building'`,
      [input.batchId],
    );
    await client.query(
      `UPDATE rights.copyright_job
       SET status='succeeded',lease_owner=NULL,lease_expires_at=NULL,completed_at=now()
       WHERE id=$1 AND status='running' AND lease_owner=$2`,
      [input.jobId, input.workerId],
    );
    await client.query(
      `INSERT INTO rights.copyright_check_event
       (id,batch_id,event_type,event_metadata)
       VALUES ($1,$2,'batch_ready',$3)`,
      [randomUUID(), input.batchId, { artifactSha256: input.artifactSha256 }],
    );
  });
}

export async function failCopyrightJob(
  database: Queryable,
  input: {
    job: CopyrightJob;
    workerId: string;
    error: Error;
    nextAttemptAt: Date;
  },
): Promise<void> {
  const retry = input.job.attemptCount < input.job.maxAttempts;
  await database.query(
    `UPDATE rights.copyright_job
     SET status=$3,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=$4,
         last_error_code='BATCH_BUILD_FAILED',last_error_message=$5,
         completed_at=CASE WHEN $3='failed' THEN now() ELSE NULL END
     WHERE id=$1 AND status='running' AND lease_owner=$2`,
    [
      input.job.id,
      input.workerId,
      retry ? "retry_wait" : "failed",
      input.nextAttemptAt,
      input.error.message.slice(0, 500),
    ],
  );
  await database.query(
    `UPDATE rights.copyright_batch SET status=$2
     WHERE id=$1 AND status='building'`,
    [input.job.batchId, retry ? "queued" : "failed"],
  );
  await database.query(
    `UPDATE rights.copyright_check SET status=$2,last_error_code='BATCH_BUILD_FAILED',
       last_error_message=$3,row_version=row_version+1
     WHERE id IN (SELECT copyright_check_id FROM rights.copyright_batch_item WHERE batch_id=$1)
       AND status='package_building'`,
    [
      input.job.batchId,
      retry ? "package_queued" : "failed",
      input.error.message.slice(0, 500),
    ],
  );
}

function mapBatch(
  rows: Array<Record<string, unknown>>,
): CopyrightBatchDto | null {
  const first = rows[0];
  if (!first) return null;
  return {
    id: String(first.batch_id),
    status: String(first.batch_status),
    youtubeVideoId: first.youtube_video_id
      ? String(first.youtube_video_id)
      : null,
    totalDurationMs: Number(first.total_duration_ms),
    gapDurationMs: Number(first.gap_duration_ms),
    itemCount: Number(first.item_count),
    expiresAt: first.expires_at
      ? new Date(first.expires_at as string | Date).toISOString()
      : null,
    createdAt: new Date(first.created_at as string | Date).toISOString(),
    items: rows
      .filter((row) => row.item_id)
      .map((row) => ({
        id: String(row.item_id),
        copyrightCheckId: String(row.copyright_check_id),
        submissionId: String(row.submission_id),
        submissionRevisionId: String(row.submission_revision_id),
        trackId: String(row.track_id),
        sequence: Number(row.sequence),
        title: String(row.title),
        sourceSha256: String(row.source_sha256),
        startMs: Number(row.start_ms),
        endMs: Number(row.end_ms),
        durationMs: Number(row.duration_ms),
        observationType:
          (row.observation_type as CopyrightObservationType | null) ?? null,
      })),
  };
}

export async function getCopyrightBatch(
  database: Queryable,
  batchId: string,
): Promise<CopyrightBatchDto | null> {
  const result = await database.query<Record<string, unknown> & QueryResultRow>(
    `SELECT batch.id AS batch_id,batch.status AS batch_status,
            batch.youtube_video_id,batch.total_duration_ms,batch.gap_duration_ms,
            batch.item_count,batch.expires_at,batch.created_at,
            item.id AS item_id,item.copyright_check_id,item.submission_id,
            item.submission_revision_id,item.track_id,item.sequence,item.title,
            item.source_sha256,item.start_ms,item.end_ms,item.duration_ms,
            latest.observation_type
     FROM rights.copyright_batch batch
     LEFT JOIN rights.copyright_batch_item item ON item.batch_id=batch.id
     LEFT JOIN LATERAL (
       SELECT observation.observation_type
       FROM rights.copyright_observation observation
       WHERE observation.batch_item_id=item.id
         AND NOT EXISTS (
           SELECT 1 FROM rights.copyright_observation replacement
           WHERE replacement.supersedes_observation_id=observation.id
         )
       ORDER BY observation.observed_at DESC LIMIT 1
     ) latest ON true
     WHERE batch.id=$1 ORDER BY item.sequence`,
    [batchId],
  );
  return mapBatch(result.rows);
}

export async function listCopyrightBatches(
  database: Queryable,
  limit = 50,
): Promise<CopyrightBatchListItem[]> {
  const result = await database.query<Record<string, unknown> & QueryResultRow>(
    `SELECT id,status,item_count,total_duration_ms,youtube_video_id,created_at
     FROM rights.copyright_batch
     ORDER BY created_at DESC,id LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    status: String(row.status),
    itemCount: Number(row.item_count),
    totalDurationMs: Number(row.total_duration_ms),
    youtubeVideoId: row.youtube_video_id ? String(row.youtube_video_id) : null,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  }));
}

export async function recordBatchVideoId(
  pool: Pool,
  input: { batchId: string; videoId: string; actorUserId: string },
): Promise<void> {
  const videoId = youtubeVideoIdSchema.parse(input.videoId);
  await withTransaction(pool, async (client) => {
    const updated = await client.query(
      `UPDATE rights.copyright_batch
     SET youtube_video_id=$2,status='manual_review'
     WHERE id=$1 AND status IN ('ready','manual_review')`,
      [input.batchId, videoId],
    );
    if ((updated.rowCount ?? 0) === 0)
      throw new Error("The copyright batch is not ready for manual review");
    await client.query(
      `UPDATE rights.copyright_check SET status='manual_review_pending',row_version=row_version+1
     WHERE id IN (SELECT copyright_check_id FROM rights.copyright_batch_item WHERE batch_id=$1)
       AND status IN ('package_ready','manual_upload_pending')`,
      [input.batchId],
    );
    await client.query(
      `INSERT INTO rights.copyright_check_event
     (id,batch_id,actor_user_id,event_type,event_metadata)
     VALUES ($1,$2,$3,'manual_video_recorded',$4)`,
      [
        randomUUID(),
        input.batchId,
        input.actorUserId,
        { youtubeVideoId: videoId },
      ],
    );
  });
}

export async function recordCopyrightObservation(
  pool: Pool,
  rawInput: unknown,
  actorUserId: string,
): Promise<string> {
  const input = observationInputSchema.parse(rawInput);
  const id = randomUUID();
  const outcome = {
    content_id_claim: "third_party_claim_observed",
    copyright_strike: "copyright_strike_observed",
    ownership_conflict: "ownership_conflict",
    reference_overlap: "reference_overlap",
    existing_internal_reference: "existing_internal_claim",
    no_claim: "no_claim_observed",
    inconclusive: "inconclusive",
  }[input.observationType];
  const eventType = {
    content_id_claim: "claim_observed",
    copyright_strike: "strike_observed",
    ownership_conflict: "conflict_observed",
    reference_overlap: "conflict_observed",
    existing_internal_reference: "claim_observed",
    no_claim: "no_claim_observed",
    inconclusive: "conflict_observed",
  }[input.observationType];
  return withTransaction(pool, async (client) => {
    if (input.batchItemId) {
      const item = await client.query(
        `SELECT 1 FROM rights.copyright_batch_item
         WHERE id=$1 AND copyright_check_id=$2`,
        [input.batchItemId, input.copyrightCheckId],
      );
      if ((item.rowCount ?? 0) === 0)
        throw new Error(
          "The batch item does not belong to this copyright check",
        );
    }
    await client.query(
      `INSERT INTO rights.copyright_observation (
         id,copyright_check_id,batch_item_id,observation_type,youtube_video_id,
         youtube_claim_id,youtube_asset_id,youtube_reference_id,claimant_name,
         claim_status,claim_policy,match_start_ms,match_end_ms,matching_duration_ms,
         notes,observed_by_user_id,observed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        input.copyrightCheckId,
        input.batchItemId ?? null,
        input.observationType,
        input.youtubeVideoId ?? null,
        input.youtubeClaimId ?? null,
        input.youtubeAssetId ?? null,
        input.youtubeReferenceId ?? null,
        input.claimantName ?? null,
        input.claimStatus ?? null,
        input.claimPolicy ?? null,
        input.matchStartMs ?? null,
        input.matchEndMs ?? null,
        input.matchStartMs != null && input.matchEndMs != null
          ? input.matchEndMs - input.matchStartMs
          : null,
        input.notes ?? null,
        actorUserId,
        input.observedAt,
      ],
    );
    await client.query(
      `UPDATE rights.copyright_check
       SET status='completed',outcome=$2,completed_at=now(),row_version=row_version+1
       WHERE id=$1`,
      [input.copyrightCheckId, outcome],
    );
    await client.query(
      `INSERT INTO rights.copyright_check_event
       (id,copyright_check_id,actor_user_id,event_type,severity,event_metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(),
        input.copyrightCheckId,
        actorUserId,
        eventType,
        input.observationType === "copyright_strike" ? "high" : "info",
        { observationId: id, outcome },
      ],
    );
    await client.query(
      `INSERT INTO rights.copyright_check_event
       (id,copyright_check_id,actor_user_id,event_type,event_metadata)
       VALUES ($1,$2,$3,'check_completed',$4)`,
      [randomUUID(), input.copyrightCheckId, actorUserId, { outcome }],
    );
    if (input.batchItemId) {
      await client.query(
        `UPDATE rights.copyright_batch batch
         SET status='completed',completed_at=now()
         WHERE batch.id=(
           SELECT item.batch_id FROM rights.copyright_batch_item item WHERE item.id=$1
         ) AND NOT EXISTS (
           SELECT 1 FROM rights.copyright_batch_item item
           WHERE item.batch_id=batch.id AND NOT EXISTS (
             SELECT 1 FROM rights.copyright_observation observation
             WHERE observation.batch_item_id=item.id
               AND NOT EXISTS (
                 SELECT 1 FROM rights.copyright_observation replacement
                 WHERE replacement.supersedes_observation_id=observation.id
               )
           )
         )`,
        [input.batchItemId],
      );
    }
    return id;
  });
}

export async function markRemainingBatchItemsNoClaim(
  pool: Pool,
  input: { batchId: string; actorUserId: string; confirmed: boolean },
): Promise<number> {
  if (!input.confirmed)
    throw new Error("Confirm what no claim observed means before continuing");
  return withTransaction(pool, async (client) => {
    const batch = await client.query<
      { youtube_video_id: string | null } & QueryResultRow
    >(
      `SELECT youtube_video_id FROM rights.copyright_batch
       WHERE id=$1 AND status IN ('manual_review','completed') FOR UPDATE`,
      [input.batchId],
    );
    const youtubeVideoId = batch.rows[0]?.youtube_video_id;
    if (!youtubeVideoId)
      throw new Error("Record the manual YouTube video ID first");
    const remaining = await client.query<
      { id: string; copyright_check_id: string } & QueryResultRow
    >(
      `SELECT item.id,item.copyright_check_id
       FROM rights.copyright_batch_item item
       WHERE item.batch_id=$1 AND NOT EXISTS (
         SELECT 1 FROM rights.copyright_observation observation
         WHERE observation.batch_item_id=item.id
           AND NOT EXISTS (
             SELECT 1 FROM rights.copyright_observation replacement
             WHERE replacement.supersedes_observation_id=observation.id
           )
       )
       ORDER BY item.sequence FOR UPDATE OF item`,
      [input.batchId],
    );
    for (const item of remaining.rows) {
      const observationId = randomUUID();
      await client.query(
        `INSERT INTO rights.copyright_observation (
           id,copyright_check_id,batch_item_id,observation_type,youtube_video_id,
           observed_by_user_id,observed_at
         ) VALUES ($1,$2,$3,'no_claim',$4,$5,now())`,
        [
          observationId,
          item.copyright_check_id,
          item.id,
          youtubeVideoId,
          input.actorUserId,
        ],
      );
      await client.query(
        `UPDATE rights.copyright_check
         SET status='completed',outcome='no_claim_observed',completed_at=now(),
             row_version=row_version+1
         WHERE id=$1`,
        [item.copyright_check_id],
      );
      await client.query(
        `INSERT INTO rights.copyright_check_event
         (id,copyright_check_id,actor_user_id,event_type,event_metadata)
         VALUES ($1,$2,$3,'no_claim_observed',$4),
                ($5,$2,$3,'check_completed',$6)`,
        [
          randomUUID(),
          item.copyright_check_id,
          input.actorUserId,
          { observationId, bulkBatchId: input.batchId },
          randomUUID(),
          { outcome: "no_claim_observed", bulkBatchId: input.batchId },
        ],
      );
    }
    if (remaining.rowCount) {
      await client.query(
        `UPDATE rights.copyright_batch SET status='completed',completed_at=now()
         WHERE id=$1 AND NOT EXISTS (
           SELECT 1 FROM rights.copyright_batch_item item
           WHERE item.batch_id=$1 AND NOT EXISTS (
             SELECT 1 FROM rights.copyright_observation observation
             WHERE observation.batch_item_id=item.id
               AND NOT EXISTS (
                 SELECT 1 FROM rights.copyright_observation replacement
                 WHERE replacement.supersedes_observation_id=observation.id
               )
           )
         )`,
        [input.batchId],
      );
    }
    return remaining.rowCount ?? 0;
  });
}

export async function supersedeCopyrightObservation(
  pool: Pool,
  input: {
    priorObservationId: string;
    rawObservation: unknown;
    actorUserId: string;
    reason: string;
  },
): Promise<string> {
  if (!input.reason.trim()) throw new Error("A correction reason is required");
  const observation = observationInputSchema.parse(input.rawObservation);
  const id = randomUUID();
  return withTransaction(pool, async (client) => {
    const prior = await client.query<
      { copyright_check_id: string } & QueryResultRow
    >(
      `SELECT copyright_check_id FROM rights.copyright_observation
       WHERE id=$1 FOR UPDATE`,
      [input.priorObservationId],
    );
    if (prior.rows[0]?.copyright_check_id !== observation.copyrightCheckId)
      throw new Error(
        "The corrected observation does not belong to this check",
      );
    await client.query(
      `INSERT INTO rights.copyright_observation (
         id,copyright_check_id,batch_item_id,supersedes_observation_id,
         observation_type,youtube_video_id,youtube_claim_id,youtube_asset_id,
         youtube_reference_id,claimant_name,claim_status,claim_policy,
         match_start_ms,match_end_ms,matching_duration_ms,notes,
         observed_by_user_id,observed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        id,
        observation.copyrightCheckId,
        observation.batchItemId ?? null,
        input.priorObservationId,
        observation.observationType,
        observation.youtubeVideoId ?? null,
        observation.youtubeClaimId ?? null,
        observation.youtubeAssetId ?? null,
        observation.youtubeReferenceId ?? null,
        observation.claimantName ?? null,
        observation.claimStatus ?? null,
        observation.claimPolicy ?? null,
        observation.matchStartMs ?? null,
        observation.matchEndMs ?? null,
        observation.matchStartMs != null && observation.matchEndMs != null
          ? observation.matchEndMs - observation.matchStartMs
          : null,
        observation.notes ?? null,
        input.actorUserId,
        observation.observedAt,
      ],
    );
    await client.query(
      `INSERT INTO rights.copyright_check_event
       (id,copyright_check_id,actor_user_id,event_type,reason,event_metadata)
       VALUES ($1,$2,$3,'observation_superseded',$4,$5)`,
      [
        randomUUID(),
        observation.copyrightCheckId,
        input.actorUserId,
        input.reason.trim(),
        { priorObservationId: input.priorObservationId, observationId: id },
      ],
    );
    const correctedOutcome = {
      content_id_claim: "third_party_claim_observed",
      copyright_strike: "copyright_strike_observed",
      ownership_conflict: "ownership_conflict",
      reference_overlap: "reference_overlap",
      existing_internal_reference: "existing_internal_claim",
      no_claim: "no_claim_observed",
      inconclusive: "inconclusive",
    }[observation.observationType];
    await client.query(
      `UPDATE rights.copyright_check SET outcome=$2,row_version=row_version+1 WHERE id=$1`,
      [observation.copyrightCheckId, correctedOutcome],
    );
    return id;
  });
}

export async function reopenCopyrightCheck(
  pool: Pool,
  input: { checkId: string; actorUserId: string; reason: string },
): Promise<string> {
  if (!input.reason.trim()) throw new Error("A reopen reason is required");
  return withTransaction(pool, async (client) => {
    const current = await client.query<
      Record<string, unknown> & QueryResultRow
    >(
      `SELECT check_record.*,analysis.technical_status
       FROM rights.copyright_check check_record
       LEFT JOIN analysis.revision_analysis analysis
         ON analysis.submission_revision_id=check_record.submission_revision_id
       WHERE check_record.id=$1 AND check_record.is_current FOR UPDATE OF check_record`,
      [input.checkId],
    );
    const row = current.rows[0];
    if (!row) throw new Error("Current copyright check was not found");
    await client.query(
      `UPDATE rights.copyright_check SET is_current=false,row_version=row_version+1 WHERE id=$1`,
      [input.checkId],
    );
    const id = randomUUID();
    await client.query(
      `INSERT INTO rights.copyright_check (
         id,submission_revision_id,track_id,round_number,is_current,provider,
         method,status,eligibility_status,readiness_status,created_by_user_id
       ) VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        row.submission_revision_id,
        row.track_id,
        Number(row.round_number) + 1,
        row.provider,
        row.method,
        row.technical_status === "complete" ? "ready" : "awaiting_technical",
        row.eligibility_status,
        row.readiness_status,
        input.actorUserId,
      ],
    );
    await client.query(
      `INSERT INTO rights.copyright_check_event
       (id,copyright_check_id,actor_user_id,event_type,reason,event_metadata)
       VALUES ($1,$2,$3,'check_reopened',$4,$5)`,
      [
        randomUUID(),
        id,
        input.actorUserId,
        input.reason.trim(),
        { priorCheckId: input.checkId },
      ],
    );
    return id;
  });
}

export async function recordYouTubeReferenceLink(
  pool: Pool,
  input: {
    checkId: string;
    referenceId: string;
    assetId?: string | null;
    actorUserId: string;
  },
): Promise<void> {
  if (!input.referenceId.trim()) throw new Error("A reference ID is required");
  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO rights.youtube_reference_link
     (id,copyright_check_id,youtube_asset_id,youtube_reference_id,recorded_by_user_id)
     VALUES ($1,$2,$3,$4,$5)`,
      [
        randomUUID(),
        input.checkId,
        input.assetId?.trim() || null,
        input.referenceId.trim(),
        input.actorUserId,
      ],
    );
    await client.query(
      `UPDATE rights.copyright_check SET readiness_status='existing_reference',row_version=row_version+1 WHERE id=$1`,
      [input.checkId],
    );
    await client.query(
      `INSERT INTO rights.copyright_check_event
     (id,copyright_check_id,actor_user_id,event_type,event_metadata)
     VALUES ($1,$2,$3,'reference_link_recorded',$4)`,
      [
        randomUUID(),
        input.checkId,
        input.actorUserId,
        { referenceLinkIdRecorded: true },
      ],
    );
  });
}

export async function recordEligibilityReview(
  pool: Pool,
  input: {
    copyrightCheckId: string;
    checklist: EligibilityChecklist;
    note?: string | null;
    actorUserId: string;
  },
): Promise<void> {
  const assessment = assessChecklist(input.checklist);
  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO rights.copyright_eligibility_review (
         id,copyright_check_id,checklist,eligibility_status,readiness_status,
         note,reviewed_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        randomUUID(),
        input.copyrightCheckId,
        input.checklist,
        assessment.eligibility,
        assessment.readiness,
        input.note ?? null,
        input.actorUserId,
      ],
    );
    await client.query(
      `UPDATE rights.copyright_check
       SET eligibility_status=$2,readiness_status=$3,row_version=row_version+1
       WHERE id=$1`,
      [input.copyrightCheckId, assessment.eligibility, assessment.readiness],
    );
    await client.query(
      `INSERT INTO rights.copyright_check_event
       (id,copyright_check_id,actor_user_id,event_type,event_metadata)
       VALUES ($1,$2,$3,'eligibility_reviewed',$4)`,
      [randomUUID(), input.copyrightCheckId, input.actorUserId, assessment],
    );
  });
}

export async function getCopyrightStatusCounts(database: Queryable) {
  const [checks, batches, jobs] = await Promise.all([
    database.query<{ status: string; count: string } & QueryResultRow>(
      `SELECT status,count(*)::text AS count FROM rights.copyright_check GROUP BY status ORDER BY status`,
    ),
    database.query<{ status: string; count: string } & QueryResultRow>(
      `SELECT status,count(*)::text AS count FROM rights.copyright_batch GROUP BY status ORDER BY status`,
    ),
    database.query<{ status: string; count: string } & QueryResultRow>(
      `SELECT status,count(*)::text AS count FROM rights.copyright_job GROUP BY status ORDER BY status`,
    ),
  ]);
  return {
    checks: checks.rows,
    batches: batches.rows,
    jobs: jobs.rows,
  };
}

export async function reconcileCopyrightJobs(database: Queryable) {
  const recovered = await database.query(
    `UPDATE rights.copyright_job
     SET status='retry_wait',lease_owner=NULL,lease_expires_at=NULL,
         next_attempt_at=now(),last_error_code='LEASE_EXPIRED',
         last_error_message='Worker lease expired; job made reclaimable'
     WHERE status='running' AND lease_expires_at <= now()`,
  );
  const requeued = await database.query(
    `UPDATE rights.copyright_batch batch SET status='queued'
     WHERE batch.status='building' AND NOT EXISTS (
       SELECT 1 FROM rights.copyright_job job
       WHERE job.batch_id=batch.id AND job.status='running'
         AND job.lease_expires_at > now()
     )`,
  );
  return {
    recovered: recovered.rowCount ?? 0,
    requeued: requeued.rowCount ?? 0,
  };
}

export async function listExpiredCopyrightBatches(database: Queryable) {
  const result = await database.query<{ id: string } & QueryResultRow>(
    `SELECT id FROM rights.copyright_batch
     WHERE expires_at <= now() AND status NOT IN ('expired','cancelled')
     ORDER BY expires_at`,
  );
  return result.rows.map((row) => row.id);
}

export async function markCopyrightBatchesExpired(
  database: Queryable,
  batchIds: readonly string[],
): Promise<number> {
  if (!batchIds.length) return 0;
  const result = await database.query(
    `UPDATE rights.copyright_batch
     SET status='expired',artifact_key=NULL,manifest_key=NULL
     WHERE id=ANY($1::uuid[])`,
    [batchIds],
  );
  return result.rowCount ?? 0;
}

export async function getBatchArtifactMetadata(
  database: Queryable,
  batchId: string,
): Promise<{ artifactKey: string; expiresAt: Date } | null> {
  const result = await database.query<
    { artifact_key: string; expires_at: Date } & QueryResultRow
  >(
    `SELECT artifact_key,expires_at FROM rights.copyright_batch
     WHERE id=$1 AND status IN ('ready','manual_review','completed')
       AND artifact_key IS NOT NULL AND expires_at > now()`,
    [batchId],
  );
  const row = result.rows[0];
  return row
    ? { artifactKey: row.artifact_key, expiresAt: row.expires_at }
    : null;
}
