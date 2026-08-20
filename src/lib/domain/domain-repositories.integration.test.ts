import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  findAudioFilesByChecksum,
  getTrackCanonicalMetadata,
  listPublishedTracks,
} from "./catalog/repository";
import { getRightsDeclaration } from "./rights/repository";
import {
  createDraftSubmission,
  createSubmissionRevision,
  getSubmissionForProducer,
  listAllSubmissions,
  listProducerSubmissions,
  listReviewableSubmissions,
  transitionSubmissionStatus,
} from "./submissions/repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

async function insertUser(pool: Pool, label: string) {
  const id = `${label}-${randomUUID()}`;
  await pool.query(
    `INSERT INTO auth."user" (
       id, name, email, "emailVerified", "createdAt", "updatedAt", role
     ) VALUES ($1, $2, $3, true, now(), now(), 'music_producer')`,
    [id, label, `${randomUUID()}@soundvault.test`],
  );
  return id;
}

async function makeDraft(pool: Pool, ownerUserId: string, title?: string) {
  return createDraftSubmission(pool, {
    ownerUserId,
    actorUserId: ownerUserId,
    title: title ?? null,
  });
}

async function makeRevision(
  pool: Pool,
  submissionId: string,
  ownerUserId: string,
) {
  return createSubmissionRevision(pool, {
    submissionId,
    submissionOwnerUserId: ownerUserId,
    actorUserId: ownerUserId,
    producerMetadata: { source: "producer" },
  });
}

async function moveToReview(
  pool: Pool,
  submissionId: string,
  actorUserId: string,
) {
  await transitionSubmissionStatus(pool, {
    submissionId,
    expectedStatus: "draft",
    nextStatus: "submitted",
    actorUserId,
  });
  await transitionSubmissionStatus(pool, {
    submissionId,
    expectedStatus: "submitted",
    nextStatus: "processing",
    actorUserId,
  });
  await transitionSubmissionStatus(pool, {
    submissionId,
    expectedStatus: "processing",
    nextStatus: "ready_for_review",
    actorUserId,
  });
}

databaseDescribe("Section 3 PostgreSQL domain", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE
      rights.rights_declaration,
      catalog.track_term_assignment,
      catalog.taxonomy_term,
      catalog.track_metadata,
      catalog.audio_file,
      catalog.audio_asset,
      workflow.submission_event,
      workflow.submission_revision,
      workflow.submission,
      workflow.submission_batch,
      catalog.track_identifier,
      catalog.track,
      catalog.composition_identifier,
      catalog.composition,
      auth.access_audit_event,
      auth.team_access,
      auth.session,
      auth.account,
      auth."user"
      CASCADE`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates an unpublished Track without a title and preserves ownership", async () => {
    const producer = await insertUser(pool, "producer");
    const draft = await makeDraft(pool, producer);

    expect(draft).toMatchObject({
      ownerUserId: producer,
      title: null,
      status: "draft",
      latestRevisionNumber: 0,
    });
    const track = await pool.query<{ publication_status: string }>(
      `SELECT publication_status FROM catalog.track WHERE id = $1`,
      [draft.trackId],
    );
    expect(track.rows[0]?.publication_status).toBe("unpublished");
  });

  it("keeps Composition optional and supports parent-child recording versions", async () => {
    const producer = await insertUser(pool, "producer");
    const compositionId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.composition (id, created_by_user_id)
       VALUES ($1, $2)`,
      [compositionId, producer],
    );
    const parent = await createDraftSubmission(pool, {
      ownerUserId: producer,
      actorUserId: producer,
      title: "Main mix",
      compositionId,
    });
    const child = await createDraftSubmission(pool, {
      ownerUserId: producer,
      actorUserId: producer,
      title: "30 second cut",
      parentTrackId: parent.trackId,
      compositionId,
      versionType: "cutdown",
    });

    const relation = await pool.query<{
      parent_track_id: string | null;
      composition_id: string | null;
    }>(
      `SELECT parent_track_id, composition_id FROM catalog.track WHERE id = $1`,
      [child.trackId],
    );
    expect(relation.rows[0]).toEqual({
      parent_track_id: parent.trackId,
      composition_id: compositionId,
    });
    const identifiers = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM catalog.composition_identifier
       WHERE composition_id = $1`,
      [compositionId],
    );
    expect(identifiers.rows[0]?.count).toBe("0");
  });

  it("enforces Track identifier uniqueness and publication status values", async () => {
    const producer = await insertUser(pool, "producer");
    const first = await makeDraft(pool, producer, "First");
    const second = await makeDraft(pool, producer, "Second");
    await pool.query(
      `INSERT INTO catalog.track_identifier
         (id, track_id, identifier_type, identifier_value)
       VALUES ($1, $2, 'isrc', 'USABC1234567')`,
      [randomUUID(), first.trackId],
    );
    await expect(
      pool.query(
        `INSERT INTO catalog.track_identifier
           (id, track_id, identifier_type, identifier_value)
         VALUES ($1, $2, 'isrc', 'USABC1234567')`,
        [randomUUID(), second.trackId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query(
        `UPDATE catalog.track SET publication_status = 'copyright_clear'
         WHERE id = $1`,
        [first.trackId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("returns only published Tracks to Library queries", async () => {
    const producer = await insertUser(pool, "producer");
    const hidden = await makeDraft(pool, producer, "Hidden");
    const visible = await makeDraft(pool, producer, "Visible");
    const revision = await makeRevision(pool, visible.id, producer);
    await moveToReview(pool, visible.id, producer);
    await transitionSubmissionStatus(pool, {
      submissionId: visible.id,
      expectedStatus: "ready_for_review",
      nextStatus: "in_review",
      actorUserId: producer,
    });
    await transitionSubmissionStatus(pool, {
      submissionId: visible.id,
      expectedStatus: "in_review",
      nextStatus: "approved",
      actorUserId: producer,
    });
    await pool.query(
      `UPDATE catalog.track
       SET publication_status = 'published',
           published_revision_id = $2,
           published_by_user_id = $3,
           published_at = now()
       WHERE id = $1`,
      [visible.trackId, revision.id, producer],
    );

    const tracks = await listPublishedTracks(pool);
    expect(tracks.map((track) => track.id)).toEqual([visible.trackId]);
    expect(tracks.map((track) => track.id)).not.toContain(hidden.trackId);
  });

  it("scopes Producer reads by owner while allowing an all-submission query", async () => {
    const firstProducer = await insertUser(pool, "first");
    const secondProducer = await insertUser(pool, "second");
    const first = await makeDraft(pool, firstProducer, "First");
    const second = await makeDraft(pool, secondProducer, "Second");

    expect(
      await getSubmissionForProducer(pool, second.id, firstProducer),
    ).toBeNull();
    expect(await listProducerSubmissions(pool, firstProducer)).toHaveLength(1);
    expect((await listProducerSubmissions(pool, firstProducer))[0]?.id).toBe(
      first.id,
    );
    expect(await listAllSubmissions(pool)).toHaveLength(2);
  });

  it("keeps submitted revisions immutable and creates a coexisting Revision 2", async () => {
    const producer = await insertUser(pool, "producer");
    const draft = await makeDraft(pool, producer);
    const first = await makeRevision(pool, draft.id, producer);
    await moveToReview(pool, draft.id, producer);
    await transitionSubmissionStatus(pool, {
      submissionId: draft.id,
      expectedStatus: "ready_for_review",
      nextStatus: "in_review",
      actorUserId: producer,
    });
    await transitionSubmissionStatus(pool, {
      submissionId: draft.id,
      expectedStatus: "in_review",
      nextStatus: "changes_requested",
      actorUserId: producer,
    });
    const second = await makeRevision(pool, draft.id, producer);
    await transitionSubmissionStatus(pool, {
      submissionId: draft.id,
      expectedStatus: "changes_requested",
      nextStatus: "submitted",
      actorUserId: producer,
    });

    expect(first.revisionNumber).toBe(1);
    expect(second.revisionNumber).toBe(2);
    const revisions = await pool.query<{
      revision_number: number;
      revision_status: string;
    }>(
      `SELECT revision_number, revision_status
       FROM workflow.submission_revision
       WHERE submission_id = $1 ORDER BY revision_number`,
      [draft.id],
    );
    expect(revisions.rows).toEqual([
      { revision_number: 1, revision_status: "superseded" },
      { revision_number: 2, revision_status: "submitted" },
    ]);
    await expect(
      pool.query(
        `INSERT INTO workflow.submission_revision (
           id, submission_id, revision_number, created_by_user_id
         ) VALUES ($1, $2, 2, $3)`,
        [randomUUID(), draft.id, producer],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects invalid stored statuses and stale concurrent transitions", async () => {
    const producer = await insertUser(pool, "producer");
    const draft = await makeDraft(pool, producer);
    await makeRevision(pool, draft.id, producer);
    await transitionSubmissionStatus(pool, {
      submissionId: draft.id,
      expectedStatus: "draft",
      nextStatus: "submitted",
      actorUserId: producer,
    });

    await expect(
      pool.query(
        `UPDATE workflow.submission SET status = 'published' WHERE id = $1`,
        [draft.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const results = await Promise.allSettled([
      transitionSubmissionStatus(pool, {
        submissionId: draft.id,
        expectedStatus: "submitted",
        nextStatus: "processing",
        actorUserId: producer,
      }),
      transitionSubmissionStatus(pool, {
        submissionId: draft.id,
        expectedStatus: "submitted",
        nextStatus: "processing",
        actorUserId: producer,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("enforces one master, allows multiple stems and validates Track ownership", async () => {
    const producer = await insertUser(pool, "producer");
    const draft = await makeDraft(pool, producer);
    const revision = await makeRevision(pool, draft.id, producer);
    const other = await makeDraft(pool, producer);
    const masterId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.audio_asset (
         id, track_id, submission_revision_id, asset_role
       ) VALUES ($1, $2, $3, 'master')`,
      [masterId, draft.trackId, revision.id],
    );
    await expect(
      pool.query(
        `INSERT INTO catalog.audio_asset (
           id, track_id, submission_revision_id, asset_role
         ) VALUES ($1, $2, $3, 'master')`,
        [randomUUID(), draft.trackId, revision.id],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    const stemIds = [randomUUID(), randomUUID()];
    await pool.query(
      `INSERT INTO catalog.audio_asset (
         id, track_id, submission_revision_id, asset_role, stem_type, sort_order
       ) VALUES
         ($1, $3, $4, 'stem', 'lead_vocals', 1),
         ($2, $3, $4, 'stem', 'drums', 2)`,
      [stemIds[0], stemIds[1], draft.trackId, revision.id],
    );
    await expect(
      pool.query(
        `INSERT INTO catalog.audio_asset (
           id, track_id, submission_revision_id, asset_role, stem_type
         ) VALUES ($1, $2, $3, 'stem', 'bass')`,
        [randomUUID(), other.trackId, revision.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const assets = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM catalog.audio_asset
       WHERE submission_revision_id = $1`,
      [revision.id],
    );
    expect(assets.rows[0]?.count).toBe("3");
  });

  it("finds duplicate file checksums without rejecting legitimate reuse", async () => {
    const producer = await insertUser(pool, "producer");
    const draft = await makeDraft(pool, producer);
    const revision = await makeRevision(pool, draft.id, producer);
    const assetIds = [randomUUID(), randomUUID()];
    await pool.query(
      `INSERT INTO catalog.audio_asset (
         id, track_id, submission_revision_id, asset_role, stem_type, sort_order
       ) VALUES
         ($1, $3, $4, 'master', NULL, 0),
         ($2, $3, $4, 'stem', 'music', 1)`,
      [assetIds[0], assetIds[1], draft.trackId, revision.id],
    );
    const checksum = "a".repeat(64);
    await pool.query(
      `INSERT INTO catalog.audio_file (
         id, audio_asset_id, file_role, original_filename, checksum_sha256
       ) VALUES
         ($1, $3, 'source', 'master.wav', $5),
         ($2, $4, 'source', 'stem.wav', $5)`,
      [randomUUID(), randomUUID(), assetIds[0], assetIds[1], checksum],
    );

    expect(await findAudioFilesByChecksum(pool, checksum)).toHaveLength(2);
  });

  it("validates canonical metadata ranges while allowing unknown values", async () => {
    const producer = await insertUser(pool, "producer");
    const draft = await makeDraft(pool, producer);
    await pool.query(
      `INSERT INTO catalog.track_metadata (track_id, updated_by_user_id)
       VALUES ($1, $2)`,
      [draft.trackId, producer],
    );
    expect(await getTrackCanonicalMetadata(pool, draft.trackId)).toMatchObject({
      trackId: draft.trackId,
      bpm: null,
      energyScore: null,
      vocalState: "unknown",
    });
    await expect(
      pool.query(
        `UPDATE catalog.track_metadata SET bpm = 0 WHERE track_id = $1`,
        [draft.trackId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        `UPDATE catalog.track_metadata SET energy_score = 1.1 WHERE track_id = $1`,
        [draft.trackId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces taxonomy uniqueness and retains assignment provenance", async () => {
    const producer = await insertUser(pool, "producer");
    const draft = await makeDraft(pool, producer);
    const revision = await makeRevision(pool, draft.id, producer);
    const termId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.taxonomy_term (id, category, slug, label)
       VALUES ($1, 'mood', 'uplifting', 'Uplifting')`,
      [termId],
    );
    await expect(
      pool.query(
        `INSERT INTO catalog.taxonomy_term (id, category, slug, label)
         VALUES ($1, 'mood', 'uplifting', 'Uplifting duplicate')`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await pool.query(
      `INSERT INTO catalog.track_term_assignment (
         id, track_id, term_id, submission_revision_id, source_kind,
         confidence, review_status, assigned_by_user_id
       ) VALUES ($1, $2, $3, $4, 'producer', 0.8, 'suggested', $5)`,
      [randomUUID(), draft.trackId, termId, revision.id, producer],
    );
    const assignment = await pool.query<{
      source_kind: string;
      confidence: string;
      review_status: string;
    }>(
      `SELECT source_kind, confidence::text, review_status
       FROM catalog.track_term_assignment WHERE track_id = $1`,
      [draft.trackId],
    );
    expect(assignment.rows[0]).toEqual({
      source_kind: "producer",
      confidence: "0.8",
      review_status: "suggested",
    });
    await expect(
      pool.query(
        `UPDATE catalog.track_term_assignment SET confidence = 1.2
         WHERE track_id = $1`,
        [draft.trackId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("stores unknown rights without copyright claims and validates dates", async () => {
    const producer = await insertUser(pool, "producer");
    const draft = await makeDraft(pool, producer);
    const revision = await makeRevision(pool, draft.id, producer);
    await pool.query(
      `INSERT INTO rights.rights_declaration (
         id, submission_revision_id, master_rights_basis,
         composition_rights_basis, content_id_eligibility,
         declared_by_user_id
       ) VALUES ($1, $2, 'unknown', 'unknown', 'unknown', $3)`,
      [randomUUID(), revision.id, producer],
    );
    expect(await getRightsDeclaration(pool, revision.id)).toMatchObject({
      masterRightsBasis: "unknown",
      compositionRightsBasis: "unknown",
      contentIdEligibility: "unknown",
    });
    await expect(
      pool.query(
        `INSERT INTO rights.rights_declaration (
           id, submission_revision_id, master_rights_basis,
           composition_rights_basis, valid_from, valid_until,
           declared_by_user_id
         ) VALUES ($1, $2, 'owned', 'owned', '2026-08-20', '2026-08-19', $3)`,
        [randomUUID(), revision.id, producer],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("returns only Coordinator-relevant statuses to the review query", async () => {
    const producer = await insertUser(pool, "producer");
    const draftOnly = await makeDraft(pool, producer, "Draft");
    const reviewable = await makeDraft(pool, producer, "Reviewable");
    await makeRevision(pool, reviewable.id, producer);
    await moveToReview(pool, reviewable.id, producer);

    const results = await listReviewableSubmissions(pool);
    expect(results.map((submission) => submission.id)).toEqual([reviewable.id]);
    expect(results.map((submission) => submission.id)).not.toContain(
      draftOnly.id,
    );
  });
});
