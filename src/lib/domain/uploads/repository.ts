import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { CurrentUser } from "@/types/auth";
import type {
  AcceptedAudioExtension,
  CreateUploadBatchInput,
  CreatedUploadBatch,
  UploadSessionDto,
  UploadWorkspaceFile,
  UploadWorkspaceSubmission,
} from "@/types/uploads";

import {
  decryptProviderSession,
  encryptProviderSession,
} from "@/lib/storage/encryption";
import type { StorageConfig } from "@/lib/storage/config";
import type {
  StorageProvider,
  StorageUploadSessionReference,
} from "@/lib/storage/provider";

import {
  assertCanMutateUploadSubmission,
  canReadUploadSubmission,
} from "./authorization";
import { mapUploadSessionRow } from "./mapper";
import type { UploadSessionRow } from "./mapper";
import {
  contentTypeForExtension,
  createUploadBatchSchema,
  producerMetadataSchema,
  validateUploadBatchLimits,
} from "./validation";

type Queryable = Pick<Pool | PoolClient, "query">;
type UploadQueryRow = UploadSessionRow & QueryResultRow;

export const RIGHTS_ACKNOWLEDGEMENT =
  "I confirm that I am authorised to submit these files for internal review.";

export class UploadRepositoryError extends Error {
  constructor(
    public readonly code:
      | "UPLOAD_NOT_FOUND"
      | "UPLOAD_CONFLICT"
      | "UPLOAD_INCOMPLETE"
      | "UPLOAD_FORBIDDEN"
      | "UPLOAD_CANCELLED",
    message: string,
  ) {
    super(message);
    this.name = "UploadRepositoryError";
  }
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

interface CreatedFileRecord {
  clientId: string;
  submissionId: string;
  revisionNumber: number;
  audioFileId: string;
  sessionId: string;
  extension: AcceptedAudioExtension;
  expectedByteSize: number;
}

async function loadCreatedBatch(
  database: Queryable,
  batchId: string,
): Promise<CreatedUploadBatch | null> {
  const submissions = await database.query<
    {
      id: string;
      title: string;
    } & QueryResultRow
  >(
    `SELECT submission.id, COALESCE(track.title, 'Untitled track') AS title
     FROM workflow.submission submission
     JOIN catalog.track track ON track.id = submission.track_id
     WHERE submission.batch_id = $1
     ORDER BY submission.created_at, submission.id`,
    [batchId],
  );
  if (submissions.rowCount === 0) return null;
  const files = await database.query<
    UploadQueryRow & { submission_id: string; client_id: string }
  >(
    `SELECT upload.*, submission.id AS submission_id,
            split_part(upload.idempotency_key, ':', 2) AS client_id
     FROM workflow.upload_session upload
     JOIN catalog.audio_file audio_file ON audio_file.id = upload.audio_file_id
     JOIN catalog.audio_asset asset ON asset.id = audio_file.audio_asset_id
     JOIN workflow.submission_revision revision ON revision.id = asset.submission_revision_id
     JOIN workflow.submission submission ON submission.id = revision.submission_id
     WHERE submission.batch_id = $1
     ORDER BY submission.created_at, asset.sort_order, audio_file.created_at`,
    [batchId],
  );
  return {
    batchId,
    submissions: submissions.rows.map((row) => ({
      submissionId: row.id,
      title: row.title,
    })),
    files: files.rows.map((row) => ({
      clientId: row.client_id,
      submissionId: row.submission_id,
      session: mapUploadSessionRow(row),
    })),
  };
}

export async function createUploadDraftBatch(
  pool: Pool,
  user: CurrentUser,
  input: CreateUploadBatchInput,
  config: StorageConfig,
  provider: StorageProvider,
): Promise<CreatedUploadBatch> {
  const parsed = createUploadBatchSchema.parse(input);
  validateUploadBatchLimits(parsed, config);
  if (user.role === "user") {
    throw new UploadRepositoryError(
      "UPLOAD_FORBIDDEN",
      "Library users cannot create uploads",
    );
  }

  const existing = await pool.query<{ id: string } & QueryResultRow>(
    `SELECT id FROM workflow.submission_batch
     WHERE created_by_user_id = $1 AND idempotency_key = $2 LIMIT 1`,
    [user.id, parsed.idempotencyKey],
  );
  if (existing.rows[0]) {
    const loaded = await loadCreatedBatch(pool, existing.rows[0].id);
    if (loaded) return loaded;
  }

  const { batchId, files } = await withTransaction(pool, async (client) => {
    const createdBatchId = randomUUID();
    await client.query(
      `INSERT INTO workflow.submission_batch
         (id, created_by_user_id, label, idempotency_key)
       VALUES ($1, $2, $3, $4)`,
      [
        createdBatchId,
        user.id,
        parsed.label?.trim() || null,
        parsed.idempotencyKey,
      ],
    );
    const createdFiles: CreatedFileRecord[] = [];
    for (const packageInput of parsed.packages) {
      const trackId = randomUUID();
      const submissionId = randomUUID();
      const revisionId = randomUUID();
      await client.query(
        `INSERT INTO catalog.track
           (id, asset_kind, title, version_type, created_by_user_id)
         VALUES ($1, 'music', $2, 'original', $3)`,
        [trackId, packageInput.workingTitle, user.id],
      );
      await client.query(
        `INSERT INTO workflow.submission (
           id, track_id, batch_id, owner_user_id, current_revision_id,
           latest_revision_number, draft_idempotency_key
         ) VALUES ($1, $2, $3, $4, $5, 1, $6)`,
        [
          submissionId,
          trackId,
          createdBatchId,
          user.id,
          revisionId,
          `${parsed.idempotencyKey}:${packageInput.clientId}`,
        ],
      );
      await client.query(
        `INSERT INTO workflow.submission_revision (
           id, submission_id, revision_number, created_by_user_id,
           producer_metadata, embedded_metadata, source_notes
         ) VALUES ($1, $2, 1, $3, $4, '{}'::jsonb, $5)`,
        [
          revisionId,
          submissionId,
          user.id,
          packageInput.producerMetadata,
          packageInput.producerMetadata.producerNotes || null,
        ],
      );
      await client.query(
        `INSERT INTO workflow.submission_event (
           id, submission_id, submission_revision_id, actor_user_id,
           event_type, to_status, event_metadata
         ) VALUES ($1, $2, $3, $4, 'created', 'draft', $5)`,
        [
          randomUUID(),
          submissionId,
          revisionId,
          user.id,
          { batchId: createdBatchId },
        ],
      );
      await client.query(
        `INSERT INTO rights.rights_declaration (
           id, submission_revision_id, master_rights_basis, master_owner_name,
           composition_rights_basis, composition_owner_name, publisher_name,
           territory, valid_from, valid_until, one_stop_clearance,
           content_id_eligibility, source_reference, notes, declared_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          randomUUID(),
          revisionId,
          packageInput.rights.masterRightsBasis,
          packageInput.rights.masterOwnerName || null,
          packageInput.rights.compositionRightsBasis,
          packageInput.rights.compositionOwnerName || null,
          packageInput.rights.publisherName || null,
          packageInput.rights.territory || null,
          packageInput.rights.validFrom || null,
          packageInput.rights.validUntil || null,
          packageInput.rights.oneStopClearance ?? null,
          packageInput.rights.contentIdEligibility,
          packageInput.rights.sourceReference || null,
          packageInput.rights.notes || null,
          user.id,
        ],
      );
      if (parsed.acknowledgementAccepted) {
        await client.query(
          `INSERT INTO rights.submission_acknowledgement (
             id, submission_revision_id, acknowledged_by_user_id, acknowledgement_text
           ) VALUES ($1, $2, $3, $4)`,
          [randomUUID(), revisionId, user.id, RIGHTS_ACKNOWLEDGEMENT],
        );
      }
      for (const file of packageInput.files) {
        const assetId = randomUUID();
        const audioFileId = randomUUID();
        const sessionId = randomUUID();
        await client.query(
          `INSERT INTO catalog.audio_asset (
             id, track_id, submission_revision_id, asset_role,
             stem_type, stem_label, display_title, sort_order
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            assetId,
            trackId,
            revisionId,
            file.role,
            file.role === "stem" ? file.stemType : null,
            file.role === "stem" ? file.customStemLabel || null : null,
            file.role === "stem"
              ? file.customStemLabel || file.stemType
              : packageInput.workingTitle,
            file.sortOrder,
          ],
        );
        await client.query(
          `INSERT INTO catalog.audio_file (
             id, audio_asset_id, file_role, original_filename,
             content_type, container_format, byte_size, technical_status
           ) VALUES ($1,$2,'source',$3,$4,$5,$6,'registered')`,
          [
            audioFileId,
            assetId,
            file.originalFilename,
            file.claimedMime || contentTypeForExtension(file.extension),
            file.extension.slice(1),
            file.byteSize,
          ],
        );
        await client.query(
          `INSERT INTO workflow.upload_session (
             id, audio_file_id, owner_user_id, storage_backend,
             expected_byte_size, idempotency_key
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            sessionId,
            audioFileId,
            user.id,
            config.provider,
            file.byteSize,
            `${parsed.idempotencyKey}:${file.clientId}`,
          ],
        );
        await client.query(
          `INSERT INTO workflow.upload_event
             (id, upload_session_id, actor_user_id, event_type)
           VALUES ($1,$2,$3,'created')`,
          [randomUUID(), sessionId, user.id],
        );
        createdFiles.push({
          clientId: file.clientId,
          submissionId,
          revisionNumber: 1,
          audioFileId,
          sessionId,
          extension: file.extension,
          expectedByteSize: file.byteSize,
        });
      }
    }
    return { batchId: createdBatchId, files: createdFiles };
  });

  for (const file of files) {
    try {
      const storageSession = await provider.createUploadSession({
        sessionId: file.sessionId,
        submissionId: file.submissionId,
        revisionNumber: file.revisionNumber,
        audioFileId: file.audioFileId,
        extension: file.extension,
        expectedByteSize: file.expectedByteSize,
      });
      const reference = storageSession.reference;
      const encrypted =
        reference.uploadUrl && config.sessionEncryptionKey
          ? encryptProviderSession(
              JSON.stringify(reference),
              config.sessionEncryptionKey,
            )
          : null;
      await withTransaction(pool, async (client) => {
        await client.query(
          `UPDATE catalog.audio_file
           SET storage_backend = $2, storage_key = $3, technical_status = 'uploading'
           WHERE id = $1`,
          [file.audioFileId, provider.kind, reference.storageKey],
        );
        await client.query(
          `UPDATE workflow.upload_session
           SET status = 'uploading', uploaded_byte_size = $2,
               provider_session_ciphertext = $3,
               provider_session_nonce = $4,
               provider_session_auth_tag = $5,
               provider_key_version = $6,
               provider_drive_id = $7,
               provider_expiration = $8,
               row_version = row_version + 1
           WHERE id = $1 AND status = 'created'`,
          [
            file.sessionId,
            storageSession.uploadedByteSize,
            encrypted?.ciphertext ?? null,
            encrypted?.nonce ?? null,
            encrypted?.authTag ?? null,
            encrypted?.keyVersion ?? null,
            reference.driveId ?? null,
            reference.expiresAt ?? null,
          ],
        );
        await client.query(
          `INSERT INTO workflow.upload_event
             (id, upload_session_id, actor_user_id, event_type)
           VALUES ($1,$2,$3,'started')`,
          [randomUUID(), file.sessionId, user.id],
        );
      });
    } catch {
      await pool.query(
        `UPDATE workflow.upload_session
         SET status = 'failed', last_error_code = 'SESSION_CREATE_FAILED',
             last_error_message = 'Storage session could not be created',
             row_version = row_version + 1
         WHERE id = $1`,
        [file.sessionId],
      );
    }
  }
  const created = await loadCreatedBatch(pool, batchId);
  if (!created)
    throw new UploadRepositoryError(
      "UPLOAD_CONFLICT",
      "Upload batch could not be read after creation",
    );
  return created;
}

interface SessionAccessRow extends UploadSessionRow, QueryResultRow {
  submission_id: string;
  revision_number: number;
  original_filename: string;
  storage_key: string | null;
  provider_session_ciphertext: string | null;
  provider_session_nonce: string | null;
  provider_session_auth_tag: string | null;
  provider_key_version: number | null;
  provider_item_id: string | null;
  provider_drive_id: string | null;
  extension: string;
  submission_status: string;
}

export async function getUploadSessionAccess(
  database: Queryable,
  sessionId: string,
): Promise<SessionAccessRow | null> {
  const result = await database.query<SessionAccessRow>(
    `SELECT upload.*, submission.id AS submission_id,
            submission.status AS submission_status,
            revision.revision_number, audio_file.original_filename,
            audio_file.storage_key,
            CASE WHEN lower(audio_file.original_filename) LIKE '%.wav' THEN '.wav' ELSE '.mp3' END AS extension
     FROM workflow.upload_session upload
     JOIN catalog.audio_file audio_file ON audio_file.id = upload.audio_file_id
     JOIN catalog.audio_asset asset ON asset.id = audio_file.audio_asset_id
     JOIN workflow.submission_revision revision ON revision.id = asset.submission_revision_id
     JOIN workflow.submission submission ON submission.id = revision.submission_id
     WHERE upload.id = $1 LIMIT 1`,
    [sessionId],
  );
  return result.rows[0] ?? null;
}

export function storageReferenceForSession(
  row: SessionAccessRow,
  config: StorageConfig,
): StorageUploadSessionReference {
  if (!row.storage_key)
    throw new UploadRepositoryError(
      "UPLOAD_CONFLICT",
      "Upload storage is not initialized",
    );
  if (row.storage_backend === "local") {
    return { sessionId: row.id, storageKey: row.storage_key };
  }
  if (
    !config.sessionEncryptionKey ||
    !row.provider_session_ciphertext ||
    !row.provider_session_nonce ||
    !row.provider_session_auth_tag ||
    !row.provider_key_version
  ) {
    throw new UploadRepositoryError(
      "UPLOAD_CONFLICT",
      "Encrypted OneDrive session is unavailable",
    );
  }
  const value = decryptProviderSession(
    {
      ciphertext: row.provider_session_ciphertext,
      nonce: row.provider_session_nonce,
      authTag: row.provider_session_auth_tag,
      keyVersion: row.provider_key_version,
    },
    config.sessionEncryptionKey,
  );
  const reference = JSON.parse(value) as StorageUploadSessionReference;
  if (row.provider_item_id) reference.itemId = row.provider_item_id;
  return reference;
}

export async function updateUploadProgress(
  pool: Pool,
  sessionId: string,
  uploadedByteSize: number,
  providerItemId?: string,
): Promise<UploadSessionDto> {
  const result = await pool.query<UploadQueryRow>(
    `UPDATE workflow.upload_session
     SET uploaded_byte_size = $2,
         provider_item_id = COALESCE($3, provider_item_id),
         status = CASE WHEN status = 'paused' THEN 'uploading' ELSE status END,
         last_error_code = NULL, last_error_message = NULL,
         row_version = row_version + 1
     WHERE id = $1
       AND status IN ('uploading', 'paused', 'failed')
       AND $2 >= uploaded_byte_size
       AND $2 <= expected_byte_size
     RETURNING *`,
    [sessionId, uploadedByteSize, providerItemId ?? null],
  );
  if (!result.rows[0])
    throw new UploadRepositoryError(
      "UPLOAD_CONFLICT",
      "Upload progress conflicted with current state",
    );
  return mapUploadSessionRow(result.rows[0]);
}

export async function completeUploadSession(
  pool: Pool,
  sessionId: string,
  user: CurrentUser,
  config: StorageConfig,
  provider: StorageProvider,
): Promise<UploadSessionDto> {
  const row = await getUploadSessionAccess(pool, sessionId);
  if (!row)
    throw new UploadRepositoryError(
      "UPLOAD_NOT_FOUND",
      "Upload Session was not found",
    );
  assertCanMutateUploadSubmission(user, row.owner_user_id);
  if (row.status === "completed") return mapUploadSessionRow(row);
  if (row.status === "cancelled")
    throw new UploadRepositoryError(
      "UPLOAD_CANCELLED",
      "Cancelled uploads cannot be completed",
    );
  const reference = storageReferenceForSession(row, config);
  const stored = await provider.verifyCompletedUpload({
    reference,
    expectedByteSize: Number(row.expected_byte_size),
    extension: row.extension as AcceptedAudioExtension,
  });
  return withTransaction(pool, async (client) => {
    await client.query(
      `UPDATE catalog.audio_file
       SET storage_backend = $2, storage_key = $3, byte_size = $4,
           content_type = $5, container_format = $6,
           technical_status = 'available'
       WHERE id = $1`,
      [
        row.audio_file_id,
        stored.storageBackend,
        stored.storageKey,
        stored.byteSize,
        stored.contentType,
        stored.containerFormat,
      ],
    );
    const result = await client.query<UploadQueryRow>(
      `UPDATE workflow.upload_session
       SET status = 'completed', uploaded_byte_size = expected_byte_size,
           provider_item_id = COALESCE($2, provider_item_id),
           provider_drive_id = COALESCE($3, provider_drive_id),
           completed_at = now(), last_error_code = NULL,
           last_error_message = NULL, row_version = row_version + 1
       WHERE id = $1 AND status <> 'cancelled'
       RETURNING *`,
      [
        sessionId,
        stored.providerItemId ?? null,
        stored.providerDriveId ?? null,
      ],
    );
    if (!result.rows[0])
      throw new UploadRepositoryError(
        "UPLOAD_CONFLICT",
        "Upload completion conflicted with current state",
      );
    await client.query(
      `INSERT INTO workflow.upload_event
         (id, upload_session_id, actor_user_id, event_type)
       VALUES ($1,$2,$3,'completed')`,
      [randomUUID(), sessionId, user.id],
    );
    return mapUploadSessionRow(result.rows[0]);
  });
}

export async function cancelUploadSession(
  pool: Pool,
  sessionId: string,
  user: CurrentUser,
  config: StorageConfig,
  provider: StorageProvider,
): Promise<UploadSessionDto> {
  const row = await getUploadSessionAccess(pool, sessionId);
  if (!row)
    throw new UploadRepositoryError(
      "UPLOAD_NOT_FOUND",
      "Upload Session was not found",
    );
  assertCanMutateUploadSubmission(user, row.owner_user_id);
  if (row.submission_status !== "draft")
    throw new UploadRepositoryError(
      "UPLOAD_CONFLICT",
      "Submitted files cannot be cancelled",
    );
  if (row.status === "cancelled") return mapUploadSessionRow(row);
  const cancelled = await pool.query<UploadQueryRow>(
    `UPDATE workflow.upload_session
     SET status = 'cancelled', cancelled_at = now(), completed_at = NULL,
         row_version = row_version + 1
     WHERE id = $1 AND status <> 'completed' RETURNING *`,
    [sessionId],
  );
  if (!cancelled.rows[0])
    throw new UploadRepositoryError(
      "UPLOAD_CONFLICT",
      "Completed uploads cannot be cancelled",
    );
  const reference = storageReferenceForSession(row, config);
  try {
    await provider.deleteDraftObject({ reference });
    await pool.query(
      `INSERT INTO workflow.upload_event
         (id, upload_session_id, actor_user_id, event_type)
       VALUES ($1,$2,$3,'cleanup_completed')`,
      [randomUUID(), sessionId, user.id],
    );
  } catch {
    await pool.query(
      `UPDATE workflow.upload_session
       SET last_error_code = 'CLEANUP_REQUIRED',
           last_error_message = 'Provider cleanup remains required'
       WHERE id = $1`,
      [sessionId],
    );
  }
  return mapUploadSessionRow(cancelled.rows[0]);
}

export async function submitCompletedDraft(
  pool: Pool,
  submissionId: string,
  user: CurrentUser,
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const locked = await client.query<
      {
        owner_user_id: string;
        status: string;
        current_revision_id: string;
      } & QueryResultRow
    >(
      `SELECT owner_user_id, status, current_revision_id
       FROM workflow.submission WHERE id = $1 FOR UPDATE`,
      [submissionId],
    );
    const submission = locked.rows[0];
    if (!submission)
      throw new UploadRepositoryError(
        "UPLOAD_NOT_FOUND",
        "Submission was not found",
      );
    assertCanMutateUploadSubmission(user, submission.owner_user_id);
    if (submission.status !== "draft") {
      if (submission.status === "submitted") return;
      throw new UploadRepositoryError(
        "UPLOAD_CONFLICT",
        "Only a draft can be submitted",
      );
    }
    const readiness = await client.query<
      {
        masters: string;
        files: string;
        available_files: string;
        acknowledgements: string;
      } & QueryResultRow
    >(
      `SELECT
         count(*) FILTER (WHERE asset.asset_role = 'master')::text AS masters,
         count(audio_file.id)::text AS files,
         count(audio_file.id) FILTER (WHERE audio_file.technical_status = 'available')::text AS available_files,
         (SELECT count(*)::text FROM rights.submission_acknowledgement acknowledgement
          WHERE acknowledgement.submission_revision_id = $1) AS acknowledgements
       FROM catalog.audio_asset asset
       LEFT JOIN catalog.audio_file audio_file ON audio_file.audio_asset_id = asset.id
       WHERE asset.submission_revision_id = $1`,
      [submission.current_revision_id],
    );
    const state = readiness.rows[0];
    if (
      !state ||
      state.masters !== "1" ||
      state.files === "0" ||
      state.files !== state.available_files ||
      state.acknowledgements !== "1"
    ) {
      throw new UploadRepositoryError(
        "UPLOAD_INCOMPLETE",
        "Every file must be received and acknowledged before submission",
      );
    }
    await client.query(
      `UPDATE workflow.submission_revision
       SET revision_status = 'submitted', submitted_at = now()
       WHERE id = $1 AND revision_status = 'draft'`,
      [submission.current_revision_id],
    );
    await client.query(
      `UPDATE workflow.submission
       SET status = 'submitted', submitted_at = now(), row_version = row_version + 1
       WHERE id = $1 AND status = 'draft'`,
      [submissionId],
    );
    await client.query(
      `INSERT INTO workflow.submission_event (
         id, submission_id, submission_revision_id, actor_user_id,
         event_type, from_status, to_status
       ) VALUES ($1,$2,$3,$4,'submitted','draft','submitted')`,
      [randomUUID(), submissionId, submission.current_revision_id, user.id],
    );
    await client.query(
      `INSERT INTO analysis.revision_analysis
         (id, submission_revision_id, track_id, overall_status)
       SELECT $1, submission.current_revision_id, submission.track_id, 'queued'
       FROM workflow.submission submission WHERE submission.id = $2
       ON CONFLICT (submission_revision_id) DO NOTHING`,
      [randomUUID(), submissionId],
    );
    await client.query(
      `INSERT INTO analysis.processing_job
         (id, job_type, submission_id, submission_revision_id, idempotency_key)
       VALUES ($1,'revision_processing',$2,$3,$4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        randomUUID(),
        submissionId,
        submission.current_revision_id,
        `revision:${submission.current_revision_id}:processing`,
      ],
    );
    const copyrightCheckId = randomUUID();
    const createdCopyrightCheck = await client.query(
      `INSERT INTO rights.copyright_check (
         id, submission_revision_id, track_id, status,
         eligibility_status, readiness_status, created_by_user_id
       )
       SELECT $1, submission.current_revision_id, submission.track_id,
              'awaiting_technical',
              CASE
                WHEN declaration.master_rights_basis = 'non_exclusive_license'
                  OR declaration.composition_rights_basis = 'non_exclusive_license'
                  THEN 'ineligible'
                WHEN declaration.id IS NULL
                  OR declaration.master_rights_basis = 'unknown'
                  OR declaration.composition_rights_basis = 'unknown'
                  THEN 'needs_rights_review'
                WHEN declaration.master_rights_basis IN ('owned','exclusive_license')
                  AND declaration.composition_rights_basis IN ('owned','exclusive_license')
                  THEN 'potentially_eligible'
                ELSE 'needs_policy_review'
              END,
              CASE
                WHEN declaration.master_rights_basis = 'non_exclusive_license'
                  OR declaration.composition_rights_basis = 'non_exclusive_license'
                  THEN 'ineligible'
                ELSE 'not_assessed'
              END,
              $3
       FROM workflow.submission submission
       LEFT JOIN rights.rights_declaration declaration
         ON declaration.submission_revision_id = submission.current_revision_id
       WHERE submission.id = $2
       ON CONFLICT (submission_revision_id) WHERE is_current DO NOTHING
       RETURNING id`,
      [copyrightCheckId, submissionId, user.id],
    );
    if (createdCopyrightCheck.rowCount) {
      await client.query(
        `INSERT INTO rights.copyright_check_event (
           id, copyright_check_id, actor_user_id, event_type, event_metadata
         ) VALUES ($1,$2,$3,'copyright_check_created',$4)`,
        [randomUUID(), copyrightCheckId, user.id, { source: "submission" }],
      );
    }
  });
}

export async function acknowledgeUploadRights(
  pool: Pool,
  submissionId: string,
  user: CurrentUser,
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const result = await client.query<
      {
        owner_user_id: string;
        current_revision_id: string;
        status: string;
      } & QueryResultRow
    >(
      `SELECT owner_user_id, current_revision_id, status
       FROM workflow.submission WHERE id = $1 FOR UPDATE`,
      [submissionId],
    );
    const submission = result.rows[0];
    if (!submission)
      throw new UploadRepositoryError(
        "UPLOAD_NOT_FOUND",
        "Submission was not found",
      );
    assertCanMutateUploadSubmission(user, submission.owner_user_id);
    if (submission.status !== "draft")
      throw new UploadRepositoryError(
        "UPLOAD_CONFLICT",
        "Only draft uploads can be acknowledged",
      );
    await client.query(
      `INSERT INTO rights.submission_acknowledgement (
         id, submission_revision_id, acknowledged_by_user_id, acknowledgement_text
       ) VALUES ($1,$2,$3,$4)
       ON CONFLICT (submission_revision_id) DO NOTHING`,
      [
        randomUUID(),
        submission.current_revision_id,
        user.id,
        RIGHTS_ACKNOWLEDGEMENT,
      ],
    );
  });
}

export async function updateDraftProducerMetadata(
  pool: Pool,
  submissionId: string,
  user: CurrentUser,
  metadata: unknown,
): Promise<void> {
  const parsed = producerMetadataSchema.parse(metadata);
  const result = await pool.query<{ owner_user_id: string } & QueryResultRow>(
    `SELECT owner_user_id FROM workflow.submission WHERE id = $1 AND status = 'draft' LIMIT 1`,
    [submissionId],
  );
  const submission = result.rows[0];
  if (!submission)
    throw new UploadRepositoryError(
      "UPLOAD_NOT_FOUND",
      "Draft Submission was not found",
    );
  assertCanMutateUploadSubmission(user, submission.owner_user_id);
  await withTransaction(pool, async (client) => {
    await client.query(
      `UPDATE workflow.submission_revision revision
       SET producer_metadata = $2, source_notes = $3
       FROM workflow.submission submission
       WHERE submission.id = $1
         AND revision.id = submission.current_revision_id
         AND submission.status = 'draft'
         AND revision.revision_status = 'draft'`,
      [submissionId, parsed, parsed.producerNotes || null],
    );
    await client.query(
      `UPDATE catalog.track track
       SET title = $2, description = $3, row_version = row_version + 1
       FROM workflow.submission submission
       WHERE submission.id = $1 AND track.id = submission.track_id AND submission.status = 'draft'`,
      [submissionId, parsed.workingTitle, parsed.description || null],
    );
  });
}

export async function listUploadWorkspaceSubmissions(
  database: Queryable,
  user: CurrentUser,
): Promise<UploadWorkspaceSubmission[]> {
  const result = await database.query<
    {
      submission_id: string;
      batch_id: string | null;
      batch_label: string | null;
      owner_user_id: string;
      owner_name: string;
      status: string;
      revision_id: string;
      revision_number: number;
      title: string;
      producer_metadata: Record<string, unknown>;
      updated_at: Date;
    } & QueryResultRow
  >(
    `SELECT submission.id AS submission_id, submission.batch_id,
            batch.label AS batch_label, submission.owner_user_id,
            owner.name AS owner_name, submission.status,
            revision.id AS revision_id, revision.revision_number,
            COALESCE(track.title, 'Untitled track') AS title,
            revision.producer_metadata, submission.updated_at
     FROM workflow.submission submission
     JOIN catalog.track track ON track.id = submission.track_id
     JOIN workflow.submission_revision revision ON revision.id = submission.current_revision_id
     JOIN auth."user" owner ON owner.id = submission.owner_user_id
     LEFT JOIN workflow.submission_batch batch ON batch.id = submission.batch_id
     WHERE ($1::boolean OR submission.owner_user_id = $2)
     ORDER BY submission.updated_at DESC, submission.id`,
    [user.role === "admin" || user.role === "coordinator", user.id],
  );
  return Promise.all(
    result.rows.map((row) =>
      loadWorkspaceSubmission(database, row.submission_id, user),
    ),
  ).then((items) =>
    items.filter((item): item is UploadWorkspaceSubmission => item !== null),
  );
}

export async function loadWorkspaceSubmission(
  database: Queryable,
  submissionId: string,
  user: CurrentUser,
): Promise<UploadWorkspaceSubmission | null> {
  const base = await database.query<
    {
      submission_id: string;
      batch_id: string | null;
      batch_label: string | null;
      owner_user_id: string;
      owner_name: string;
      status: string;
      revision_id: string;
      revision_number: number;
      title: string;
      producer_metadata: Record<string, unknown>;
      acknowledged: boolean;
      updated_at: Date | string;
    } & QueryResultRow
  >(
    `SELECT submission.id AS submission_id, submission.batch_id,
            batch.label AS batch_label, submission.owner_user_id,
            owner.name AS owner_name, submission.status,
            revision.id AS revision_id, revision.revision_number,
            COALESCE(track.title, 'Untitled track') AS title,
            revision.producer_metadata,
            EXISTS (
              SELECT 1 FROM rights.submission_acknowledgement acknowledgement
              WHERE acknowledgement.submission_revision_id = revision.id
            ) AS acknowledged,
            submission.updated_at
     FROM workflow.submission submission
     JOIN catalog.track track ON track.id = submission.track_id
     JOIN workflow.submission_revision revision ON revision.id = submission.current_revision_id
     JOIN auth."user" owner ON owner.id = submission.owner_user_id
     LEFT JOIN workflow.submission_batch batch ON batch.id = submission.batch_id
     WHERE submission.id = $1 LIMIT 1`,
    [submissionId],
  );
  const row = base.rows[0];
  if (!row || !canReadUploadSubmission(user, row.owner_user_id)) return null;
  const files = await database.query<
    {
      audio_file_id: string;
      session_id: string;
      asset_role: "master" | "stem";
      stem_type: string | null;
      stem_label: string | null;
      sort_order: number;
      original_filename: string;
      byte_size: number | string;
      content_type: string | null;
      container_format: string | null;
      technical_status: string;
      upload_status: UploadWorkspaceFile["uploadStatus"];
      uploaded_byte_size: number | string;
    } & QueryResultRow
  >(
    `SELECT audio_file.id AS audio_file_id, upload.id AS session_id,
            asset.asset_role, asset.stem_type, asset.stem_label, asset.sort_order,
            audio_file.original_filename, audio_file.byte_size,
            audio_file.content_type, audio_file.container_format,
            audio_file.technical_status, upload.status AS upload_status,
            upload.uploaded_byte_size
     FROM catalog.audio_asset asset
     JOIN catalog.audio_file audio_file ON audio_file.audio_asset_id = asset.id
     JOIN workflow.upload_session upload ON upload.audio_file_id = audio_file.id
     WHERE asset.submission_revision_id = $1
     ORDER BY asset.sort_order, audio_file.created_at`,
    [row.revision_id],
  );
  const mappedFiles: UploadWorkspaceFile[] = files.rows.map((file) => ({
    audioFileId: file.audio_file_id,
    sessionId: file.session_id,
    role: file.asset_role,
    stemType: file.stem_type,
    stemLabel: file.stem_label,
    sortOrder: file.sort_order,
    originalFilename: file.original_filename,
    byteSize: Number(file.byte_size),
    contentType: file.content_type,
    containerFormat: file.container_format,
    technicalStatus: file.technical_status,
    uploadStatus: file.upload_status,
    uploadedBytes: Number(file.uploaded_byte_size),
  }));
  return {
    id: row.submission_id,
    batchId: row.batch_id,
    batchLabel: row.batch_label,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    status: row.status,
    revisionId: row.revision_id,
    revisionNumber: row.revision_number,
    title: row.title,
    producerMetadata: row.producer_metadata,
    acknowledged: row.acknowledged,
    updatedAt: new Date(row.updated_at).toISOString(),
    totalFiles: mappedFiles.length,
    masterCount: mappedFiles.filter((file) => file.role === "master").length,
    stemCount: mappedFiles.filter((file) => file.role === "stem").length,
    uploadedBytes: mappedFiles.reduce(
      (total, file) => total + file.uploadedBytes,
      0,
    ),
    totalBytes: mappedFiles.reduce((total, file) => total + file.byteSize, 0),
    files: mappedFiles,
  };
}

export async function listResumableBatches(
  database: Queryable,
  user: CurrentUser,
): Promise<
  Array<{
    id: string;
    label: string | null;
    updatedAt: string;
    pendingFiles: number;
  }>
> {
  const result = await database.query<
    {
      id: string;
      label: string | null;
      updated_at: Date | string;
      pending_files: string;
    } & QueryResultRow
  >(
    `SELECT batch.id, batch.label, batch.updated_at,
            count(upload.id) FILTER (WHERE upload.status <> 'completed')::text AS pending_files
     FROM workflow.submission_batch batch
     JOIN workflow.submission submission ON submission.batch_id = batch.id
     JOIN workflow.submission_revision revision ON revision.id = submission.current_revision_id
     JOIN catalog.audio_asset asset ON asset.submission_revision_id = revision.id
     JOIN catalog.audio_file audio_file ON audio_file.audio_asset_id = asset.id
     JOIN workflow.upload_session upload ON upload.audio_file_id = audio_file.id
     WHERE batch.created_by_user_id = $1 AND submission.status = 'draft'
     GROUP BY batch.id
     ORDER BY batch.updated_at DESC`,
    [user.id],
  );
  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    updatedAt: new Date(row.updated_at).toISOString(),
    pendingFiles: Number(row.pending_files),
  }));
}

export async function listBatchWorkspaceSubmissions(
  database: Queryable,
  batchId: string,
  user: CurrentUser,
): Promise<UploadWorkspaceSubmission[]> {
  const items = await listUploadWorkspaceSubmissions(database, user);
  return items.filter((item) => item.batchId === batchId);
}

export async function listSubmissionEvents(
  database: Queryable,
  submissionId: string,
): Promise<
  Array<{
    id: string;
    type: string;
    fromStatus: string | null;
    toStatus: string | null;
    createdAt: string;
  }>
> {
  const result = await database.query<
    {
      id: string;
      event_type: string;
      from_status: string | null;
      to_status: string | null;
      created_at: Date | string;
    } & QueryResultRow
  >(
    `SELECT id, event_type, from_status, to_status, created_at
     FROM workflow.submission_event
     WHERE submission_id = $1
     ORDER BY created_at DESC, id`,
    [submissionId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    type: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function listCleanupCandidates(database: Queryable): Promise<
  Array<{
    sessionId: string;
    ownerUserId: string;
    status: string;
    submissionStatus: string;
  }>
> {
  const result = await database.query<
    {
      session_id: string;
      owner_user_id: string;
      status: string;
      submission_status: string;
    } & QueryResultRow
  >(
    `SELECT upload.id AS session_id, upload.owner_user_id, upload.status,
            submission.status AS submission_status
     FROM workflow.upload_session upload
     JOIN catalog.audio_file audio_file ON audio_file.id = upload.audio_file_id
     JOIN catalog.audio_asset asset ON asset.id = audio_file.audio_asset_id
     JOIN workflow.submission_revision revision ON revision.id = asset.submission_revision_id
     JOIN workflow.submission submission ON submission.id = revision.submission_id
     WHERE upload.status IN ('cancelled', 'expired')
       AND submission.status = 'draft'
     ORDER BY upload.updated_at`,
  );
  return result.rows.map((row) => ({
    sessionId: row.session_id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    submissionStatus: row.submission_status,
  }));
}

export async function cleanupCancelledUpload(
  pool: Pool,
  sessionId: string,
  config: StorageConfig,
  provider: StorageProvider,
): Promise<void> {
  const row = await getUploadSessionAccess(pool, sessionId);
  if (
    !row ||
    !["cancelled", "expired"].includes(row.status) ||
    row.submission_status !== "draft"
  ) {
    throw new UploadRepositoryError(
      "UPLOAD_CONFLICT",
      "Cleanup is restricted to cancelled or expired draft uploads",
    );
  }
  await provider.deleteDraftObject({
    reference: storageReferenceForSession(row, config),
  });
  await pool.query(
    `UPDATE workflow.upload_session
     SET last_error_code = NULL, last_error_message = NULL,
         row_version = row_version + 1
     WHERE id = $1 AND status IN ('cancelled', 'expired')`,
    [sessionId],
  );
  await pool.query(
    `INSERT INTO workflow.upload_event
       (id, upload_session_id, event_type)
     VALUES ($1,$2,'cleanup_completed')`,
    [randomUUID(), sessionId],
  );
}
