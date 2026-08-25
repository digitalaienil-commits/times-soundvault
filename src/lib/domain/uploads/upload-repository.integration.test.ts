import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import type { CurrentUser } from "@/types/auth";
import type { CreateUploadBatchInput } from "@/types/uploads";
import type { StorageConfig } from "@/lib/storage/config";
import { LocalStorageProvider } from "@/lib/storage/local/provider";

import {
  cancelUploadSession,
  completeUploadSession,
  createUploadDraftBatch,
  getUploadSessionAccess,
  storageReferenceForSession,
  submitCompletedDraft,
  updateUploadProgress,
} from "./repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

function wavBytes(): Buffer {
  const buffer = Buffer.alloc(48);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(40, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(4, 40);
  return buffer;
}

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Response(Uint8Array.from(bytes).buffer).body!;
}

async function insertUser(
  pool: Pool,
  role: CurrentUser["role"],
): Promise<CurrentUser> {
  const id = `${role}-${randomUUID()}`;
  const name = role.replaceAll("_", " ");
  await pool.query(
    `INSERT INTO auth."user" (
       id, name, email, "emailVerified", "createdAt", "updatedAt", role
     ) VALUES ($1,$2,$3,true,now(),now(),$4)`,
    [id, name, `${randomUUID()}@soundvault.test`, role],
  );
  return {
    id,
    name,
    email: `${id}@soundvault.test`,
    initials: "SV",
    role,
    accessStatus: "active",
  };
}

function input(
  byteSize: number,
  idempotencyKey = `request-${randomUUID()}`,
): CreateUploadBatchInput {
  return {
    idempotencyKey,
    label: "Integration batch",
    acknowledgementAccepted: true,
    packages: [
      {
        clientId: "track-1",
        workingTitle: "Integration Theme",
        producerMetadata: { workingTitle: "Integration Theme" },
        rights: {
          masterRightsBasis: "unknown",
          compositionRightsBasis: "unknown",
        },
        files: [
          {
            clientId: "file-1",
            originalFilename: "Integration_MASTER.wav",
            claimedMime: "audio/wav",
            extension: ".wav",
            byteSize,
            role: "master",
            sortOrder: 0,
          },
        ],
      },
    ],
  };
}

databaseDescribe("Section 4 PostgreSQL upload workspace", () => {
  let pool: Pool;
  let root: string;
  let provider: LocalStorageProvider;
  let config: StorageConfig;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testDatabaseUrl });
    root = await mkdtemp(path.join(tmpdir(), "soundvault-upload-integration-"));
    provider = new LocalStorageProvider(root);
    config = {
      provider: "local",
      localRoot: root,
      maxFileBytes: 2 * 1024 ** 3,
      maxBatchBytes: 20 * 1024 ** 3,
      maxTracksPerBatch: 25,
      maxStemsPerTrack: 32,
      concurrency: 3,
      advisoryMaxDurationSeconds: 1800,
    };
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE
      workflow.upload_event,
      workflow.upload_session,
      rights.submission_acknowledgement,
      rights.rights_declaration,
      catalog.audio_file,
      catalog.audio_asset,
      workflow.submission_event,
      workflow.submission_revision,
      workflow.submission,
      workflow.submission_batch,
      catalog.track,
      auth.access_audit_event,
      auth.team_access,
      auth.session,
      auth.account,
      auth."user"
      CASCADE`);
  });

  afterAll(async () => {
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });

  it("creates a transactional batch and returns the same records for an idempotent retry", async () => {
    const producer = await insertUser(pool, "music_producer");
    const bytes = wavBytes();
    const request = input(bytes.length, "stable-request-123");
    request.packages.push({
      ...request.packages[0]!,
      clientId: "track-2",
      workingTitle: "Second Theme",
      producerMetadata: { workingTitle: "Second Theme" },
      files: [
        {
          ...request.packages[0]!.files[0]!,
          clientId: "file-2",
          originalFilename: "Second_MASTER.wav",
        },
      ],
    });
    const first = await createUploadDraftBatch(
      pool,
      producer,
      request,
      config,
      provider,
    );
    const second = await createUploadDraftBatch(
      pool,
      producer,
      request,
      config,
      provider,
    );
    expect(first.batchId).toBe(second.batchId);
    expect(first.submissions).toHaveLength(2);
    expect(first.files).toHaveLength(2);
    const records = await pool.query<{
      submissions: string;
      revisions: string;
      sessions: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM workflow.submission) AS submissions,
         (SELECT count(*)::text FROM workflow.submission_revision) AS revisions,
         (SELECT count(*)::text FROM workflow.upload_session) AS sessions`,
    );
    expect(records.rows[0]).toEqual({
      submissions: "2",
      revisions: "2",
      sessions: "2",
    });
  });

  it("resumes a file, completes idempotently, updates Audio File and submits with an event", async () => {
    const producer = await insertUser(pool, "music_producer");
    const bytes = wavBytes();
    const created = await createUploadDraftBatch(
      pool,
      producer,
      input(bytes.length),
      config,
      provider,
    );
    const file = created.files[0]!;
    const row = await getUploadSessionAccess(pool, file.session.id);
    expect(row?.owner_user_id).toBe(producer.id);
    const reference = storageReferenceForSession(row!, config);
    const first = await provider.writeChunk({
      reference,
      body: stream(bytes.subarray(0, 20)),
      start: 0,
      end: 19,
      total: bytes.length,
    });
    await updateUploadProgress(pool, file.session.id, first.uploadedByteSize);
    const resumed = await provider.getUploadStatus(reference);
    expect(resumed.uploadedByteSize).toBe(20);
    const second = await provider.writeChunk({
      reference,
      body: stream(bytes.subarray(20)),
      start: 20,
      end: bytes.length - 1,
      total: bytes.length,
    });
    await updateUploadProgress(pool, file.session.id, second.uploadedByteSize);
    const completed = await completeUploadSession(
      pool,
      file.session.id,
      producer,
      config,
      provider,
    );
    const completedAgain = await completeUploadSession(
      pool,
      file.session.id,
      producer,
      config,
      provider,
    );
    expect(completed.status).toBe("completed");
    expect(completedAgain.id).toBe(completed.id);
    const audio = await pool.query<{
      technical_status: string;
      storage_backend: string;
      container_format: string;
    }>(
      `SELECT technical_status, storage_backend, container_format
       FROM catalog.audio_file WHERE id = $1`,
      [file.session.audioFileId],
    );
    expect(audio.rows[0]).toEqual({
      technical_status: "available",
      storage_backend: "local",
      container_format: "wav",
    });
    await submitCompletedDraft(pool, file.submissionId, producer);
    const state = await pool.query<{
      status: string;
      revision_status: string;
      events: string;
    }>(
      `SELECT submission.status, revision.revision_status,
              (SELECT count(*)::text FROM workflow.submission_event event
               WHERE event.submission_id = submission.id AND event.event_type = 'submitted') AS events
       FROM workflow.submission submission
       JOIN workflow.submission_revision revision ON revision.id = submission.current_revision_id
       WHERE submission.id = $1`,
      [file.submissionId],
    );
    expect(state.rows[0]).toEqual({
      status: "submitted",
      revision_status: "submitted",
      events: "1",
    });
    await expect(
      pool.query(
        `UPDATE workflow.submission_revision
         SET producer_metadata = '{"changed":true}'::jsonb
         WHERE submission_id = $1`,
        [file.submissionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("does not mark a spoofed file available and enforces upload-session ownership", async () => {
    const producer = await insertUser(pool, "music_producer");
    const other = await insertUser(pool, "music_producer");
    const bytes = Buffer.alloc(48, 0x4d);
    const created = await createUploadDraftBatch(
      pool,
      producer,
      input(bytes.length),
      config,
      provider,
    );
    const file = created.files[0]!;
    const row = await getUploadSessionAccess(pool, file.session.id);
    const reference = storageReferenceForSession(row!, config);
    const uploaded = await provider.writeChunk({
      reference,
      body: stream(bytes),
      start: 0,
      end: bytes.length - 1,
      total: bytes.length,
    });
    await updateUploadProgress(
      pool,
      file.session.id,
      uploaded.uploadedByteSize,
    );
    await expect(
      completeUploadSession(pool, file.session.id, producer, config, provider),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    const technical = await pool.query<{ technical_status: string }>(
      `SELECT technical_status FROM catalog.audio_file WHERE id = $1`,
      [file.session.audioFileId],
    );
    expect(technical.rows[0]?.technical_status).not.toBe("available");
    await expect(
      completeUploadSession(pool, file.session.id, other, config, provider),
    ).rejects.toMatchObject({ code: "UPLOAD_FORBIDDEN" });
    await expect(
      pool.query(
        `INSERT INTO workflow.upload_session
           (id, audio_file_id, owner_user_id, storage_backend, expected_byte_size, idempotency_key)
         VALUES ($1,$2,$3,'local',48,$4)`,
        [
          randomUUID(),
          file.session.audioFileId,
          other.id,
          `wrong-owner-${randomUUID()}`,
        ],
      ),
    ).rejects.toMatchObject({ code: expect.stringMatching(/23505|23514/) });
  });

  it("rejects impossible progress and prevents incomplete or cancelled completion", async () => {
    const producer = await insertUser(pool, "music_producer");
    const bytes = wavBytes();
    const created = await createUploadDraftBatch(
      pool,
      producer,
      input(bytes.length),
      config,
      provider,
    );
    const file = created.files[0]!;
    await expect(
      updateUploadProgress(pool, file.session.id, bytes.length + 1),
    ).rejects.toMatchObject({ code: "UPLOAD_CONFLICT" });
    await expect(
      submitCompletedDraft(pool, file.submissionId, producer),
    ).rejects.toMatchObject({ code: "UPLOAD_INCOMPLETE" });
    const cancelled = await cancelUploadSession(
      pool,
      file.session.id,
      producer,
      config,
      provider,
    );
    expect(cancelled.status).toBe("cancelled");
    await expect(
      completeUploadSession(pool, file.session.id, producer, config, provider),
    ).rejects.toMatchObject({ code: "UPLOAD_CANCELLED" });
  });

  it("creates and submits immutable Revision N+1 after changes are requested", async () => {
    const producer = await insertUser(pool, "music_producer");
    const bytes = wavBytes();
    const original = await createUploadDraftBatch(
      pool,
      producer,
      input(bytes.length, "original-revision-request"),
      config,
      provider,
    );
    const originalFile = original.files[0]!;
    const originalAccess = await getUploadSessionAccess(
      pool,
      originalFile.session.id,
    );
    const originalReference = storageReferenceForSession(
      originalAccess!,
      config,
    );
    const originalWrite = await provider.writeChunk({
      reference: originalReference,
      body: stream(bytes),
      start: 0,
      end: bytes.length - 1,
      total: bytes.length,
    });
    await updateUploadProgress(
      pool,
      originalFile.session.id,
      originalWrite.uploadedByteSize,
    );
    await completeUploadSession(
      pool,
      originalFile.session.id,
      producer,
      config,
      provider,
    );
    await submitCompletedDraft(pool, originalFile.submissionId, producer);
    await pool.query(
      `UPDATE workflow.submission SET status='changes_requested' WHERE id=$1`,
      [originalFile.submissionId],
    );

    const revisionInput = input(bytes.length, "replacement-revision-request");
    revisionInput.revisionSubmissionId = originalFile.submissionId;
    revisionInput.packages[0]!.workingTitle = "Integration Theme Revised";
    revisionInput.packages[0]!.producerMetadata.workingTitle =
      "Integration Theme Revised";
    const replacement = await createUploadDraftBatch(
      pool,
      producer,
      revisionInput,
      config,
      provider,
    );
    const replacementFile = replacement.files[0]!;
    expect(replacementFile.submissionId).toBe(originalFile.submissionId);
    const replacementAccess = await getUploadSessionAccess(
      pool,
      replacementFile.session.id,
    );
    const replacementReference = storageReferenceForSession(
      replacementAccess!,
      config,
    );
    expect(replacementReference.storageKey).toContain("/revisions/2/");
    const replacementWrite = await provider.writeChunk({
      reference: replacementReference,
      body: stream(bytes),
      start: 0,
      end: bytes.length - 1,
      total: bytes.length,
    });
    await updateUploadProgress(
      pool,
      replacementFile.session.id,
      replacementWrite.uploadedByteSize,
    );
    await completeUploadSession(
      pool,
      replacementFile.session.id,
      producer,
      config,
      provider,
    );
    await submitCompletedDraft(pool, replacementFile.submissionId, producer);

    const revisions = await pool.query<{
      revision_number: number;
      revision_status: string;
    }>(
      `SELECT revision_number,revision_status
       FROM workflow.submission_revision WHERE submission_id=$1
       ORDER BY revision_number`,
      [originalFile.submissionId],
    );
    expect(revisions.rows).toEqual([
      { revision_number: 1, revision_status: "superseded" },
      { revision_number: 2, revision_status: "submitted" },
    ]);
    const event = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM workflow.submission_event
       WHERE submission_id=$1 AND event_type='resubmitted'
         AND from_status='changes_requested' AND to_status='submitted'`,
      [originalFile.submissionId],
    );
    expect(event.rows[0]?.count).toBe("1");
    await expect(
      provider.getUploadStatus(originalReference),
    ).resolves.toMatchObject({ uploadedByteSize: bytes.length });
  });
});
