import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import type { EligibilityChecklist } from "./eligibility";
import {
  claimNextCopyrightJob,
  createCopyrightBatch,
  markRemainingBatchItemsNoClaim,
  recordBatchVideoId,
  recordCopyrightObservation,
  recordEligibilityReview,
  reconcileCopyrightChecks,
  reopenCopyrightCheck,
  supersedeCopyrightObservation,
} from "./repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

const checklist: EligibilityChecklist = {
  exclusiveMasterRights: "yes",
  compositionRights: "yes",
  nonExclusiveComponents: "no",
  thirdPartySamplesOrLoops: "no",
  sufficientlyDistinct: "yes",
  individualMusicalWork: "yes",
  genericProductionAudio: "no",
  ownershipTerritoryKnown: "yes",
  ownershipPeriodKnown: "yes",
  identificationMetadataAvailable: "yes",
  existingYouTubeReferenceKnown: "no",
  manualPolicyReviewRequired: "no",
};

databaseDescribe("Section 6 copyright persistence", () => {
  let pool: Pool;
  let actorUserId: string;
  let submissionId: string;
  let revisionId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE
      rights.copyright_check_event,
      rights.copyright_observation,
      rights.youtube_reference_link,
      rights.copyright_job,
      rights.copyright_batch_item,
      rights.copyright_batch,
      rights.copyright_eligibility_review,
      rights.copyright_check
      CASCADE`);
    actorUserId = `copyright-${randomUUID()}`;
    await pool.query(
      `INSERT INTO auth."user" (id,name,email,"emailVerified","createdAt","updatedAt",role)
       VALUES ($1,'Copyright Test',$2,true,now(),now(),'coordinator')`,
      [actorUserId, `${randomUUID()}@soundvault.test`],
    );
    const trackId = randomUUID();
    submissionId = randomUUID();
    revisionId = randomUUID();
    const client = await pool.connect();
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO catalog.track (id,title,created_by_user_id) VALUES ($1,'Synthetic Copyright Track',$2)`,
        [trackId, actorUserId],
      );
      await client.query(
        `INSERT INTO workflow.submission (id,track_id,owner_user_id,status)
         VALUES ($1,$2,$3,'ready_for_review')`,
        [submissionId, trackId, actorUserId],
      );
      await client.query(
        `INSERT INTO workflow.submission_revision
         (id,submission_id,revision_number,created_by_user_id,revision_status,submitted_at)
         VALUES ($1,$2,1,$3,'submitted',now())`,
        [revisionId, submissionId, actorUserId],
      );
      await client.query(
        `UPDATE workflow.submission SET current_revision_id=$2,latest_revision_number=1,submitted_at=now() WHERE id=$1`,
        [submissionId, revisionId],
      );
      await client.query(
        `INSERT INTO analysis.revision_analysis
         (id,submission_revision_id,track_id,technical_status,overall_status)
         VALUES ($1,$2,$3,'complete','complete')`,
        [randomUUID(), revisionId, trackId],
      );
      const assetId = randomUUID();
      const audioFileId = randomUUID();
      await client.query(
        `INSERT INTO catalog.audio_asset
         (id,track_id,submission_revision_id,asset_role,display_title)
         VALUES ($1,$2,$3,'master','Synthetic Master')`,
        [assetId, trackId, revisionId],
      );
      await client.query(
        `INSERT INTO catalog.audio_file
         (id,audio_asset_id,file_role,original_filename,storage_backend,storage_key,
          content_type,container_format,codec,byte_size,technical_status)
         VALUES ($1,$2,'source','synthetic.wav','local',$3,'audio/wav','wav','pcm_s16le',1024,'available')`,
        [
          audioFileId,
          assetId,
          `submissions/${submissionId}/revisions/1/${audioFileId}.wav`,
        ],
      );
      await client.query(
        `INSERT INTO analysis.file_technical_result
         (audio_file_id,submission_revision_id,asset_id,asset_role,sha256,
          duration_ms,container_format,codec)
         VALUES ($1,$2,$3,'master',$4,1000,'wav','pcm_s16le')`,
        [audioFileId, revisionId, assetId, "a".repeat(64)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reconciles a current check idempotently without changing workflow state", async () => {
    expect(
      (await reconcileCopyrightChecks(pool, actorUserId)).created,
    ).toBeGreaterThan(0);
    expect(await reconcileCopyrightChecks(pool, actorUserId)).toMatchObject({
      created: 0,
    });
    const result = await pool.query(
      `SELECT check_record.status,submission.status AS submission_status
       FROM rights.copyright_check check_record
       JOIN workflow.submission_revision revision ON revision.id=check_record.submission_revision_id
       JOIN workflow.submission submission ON submission.id=revision.submission_id
       WHERE check_record.submission_revision_id=$1`,
      [revisionId],
    );
    expect(result.rows).toEqual([
      { status: "ready", submission_status: "ready_for_review" },
    ]);
  });

  it("stores eligibility, creates a Master-only batch, and leases one durable job", async () => {
    await reconcileCopyrightChecks(pool, actorUserId);
    const check = await pool.query<{ id: string }>(
      `SELECT id FROM rights.copyright_check WHERE submission_revision_id=$1 AND is_current`,
      [revisionId],
    );
    const checkId = check.rows[0]!.id;
    await recordEligibilityReview(pool, {
      copyrightCheckId: checkId,
      checklist,
      actorUserId,
    });
    const batchId = await createCopyrightBatch(pool, {
      checkIds: [checkId],
      actorUserId,
      maxTracks: 20,
      maxDurationMs: 5_400_000,
      gapMs: 2_000,
      retentionDays: 7,
    });
    const items = await pool.query(
      `SELECT item.sequence,asset.asset_role
       FROM rights.copyright_batch_item item
       JOIN catalog.audio_file audio_file ON audio_file.id=item.audio_file_id
       JOIN catalog.audio_asset asset ON asset.id=audio_file.audio_asset_id
       WHERE item.batch_id=$1`,
      [batchId],
    );
    expect(items.rows).toEqual([{ sequence: 1, asset_role: "master" }]);
    expect(
      await claimNextCopyrightJob(pool, "integration-worker", 60_000),
    ).toMatchObject({ batchId });
  });

  it("retains corrected observations and historical check rounds", async () => {
    await reconcileCopyrightChecks(pool, actorUserId);
    const check = await pool.query<{ id: string }>(
      `SELECT id FROM rights.copyright_check WHERE submission_revision_id=$1 AND is_current`,
      [revisionId],
    );
    const checkId = check.rows[0]!.id;
    const prior = await recordCopyrightObservation(
      pool,
      {
        copyrightCheckId: checkId,
        observationType: "content_id_claim",
        observedAt: new Date(),
      },
      actorUserId,
    );
    await supersedeCopyrightObservation(pool, {
      priorObservationId: prior,
      rawObservation: {
        copyrightCheckId: checkId,
        observationType: "no_claim",
        observedAt: new Date(),
      },
      actorUserId,
      reason: "Corrected test-only observation",
    });
    const newCheckId = await reopenCopyrightCheck(pool, {
      checkId,
      actorUserId,
      reason: "Run another manual test",
    });
    const counts = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM rights.copyright_observation WHERE copyright_check_id=$1) AS observations,
         (SELECT count(*)::int FROM rights.copyright_check WHERE submission_revision_id=$2) AS rounds,
         (SELECT outcome FROM rights.copyright_check WHERE id=$1) AS corrected_outcome`,
      [checkId, revisionId],
    );
    expect(counts.rows[0]).toMatchObject({
      observations: 2,
      rounds: 2,
      corrected_outcome: "no_claim_observed",
    });
    expect(newCheckId).not.toBe(checkId);
  });

  it("bulk-records no-claim only for unobserved items after confirmation", async () => {
    await reconcileCopyrightChecks(pool, actorUserId);
    const check = await pool.query<{ id: string }>(
      `SELECT id FROM rights.copyright_check WHERE submission_revision_id=$1 AND is_current`,
      [revisionId],
    );
    const checkId = check.rows[0]!.id;
    await recordEligibilityReview(pool, {
      copyrightCheckId: checkId,
      checklist,
      actorUserId,
    });
    const batchId = await createCopyrightBatch(pool, {
      checkIds: [checkId],
      actorUserId,
      maxTracks: 20,
      maxDurationMs: 5_400_000,
      gapMs: 2_000,
      retentionDays: 7,
    });
    await pool.query(
      `UPDATE rights.copyright_batch SET status='ready' WHERE id=$1`,
      [batchId],
    );
    await recordBatchVideoId(pool, {
      batchId,
      videoId: "TestOnly_02",
      actorUserId,
    });
    await expect(
      markRemainingBatchItemsNoClaim(pool, {
        batchId,
        actorUserId,
        confirmed: false,
      }),
    ).rejects.toThrow(/confirm/i);
    await expect(
      markRemainingBatchItemsNoClaim(pool, {
        batchId,
        actorUserId,
        confirmed: true,
      }),
    ).resolves.toBe(1);
    await expect(
      markRemainingBatchItemsNoClaim(pool, {
        batchId,
        actorUserId,
        confirmed: true,
      }),
    ).resolves.toBe(0);
    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM rights.copyright_observation WHERE copyright_check_id=$1) AS observations,
         (SELECT status FROM rights.copyright_batch WHERE id=$2) AS batch_status,
         (SELECT count(*)::int FROM rights.copyright_check_event
          WHERE copyright_check_id=$1 AND event_type='check_completed') AS completions`,
      [checkId, batchId],
    );
    expect(result.rows[0]).toMatchObject({
      observations: 1,
      batch_status: "completed",
      completions: 1,
    });
  });
});
