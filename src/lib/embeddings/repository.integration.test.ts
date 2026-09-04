import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  claimNextEmbeddingJob,
  completeEmbeddingJob,
  enqueueMissingEmbeddings,
  findNearestPublishedTracks,
  getEmbeddingStatus,
  getTrackEmbedding,
} from "./repository";
import { SimulatedEmbeddingProvider } from "./provider";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

databaseDescribe("Section 13 PGVector and Track Embeddings Integration", () => {
  let pool: Pool;
  let userId: string;
  let publishedTrackId: string;
  let publishedRevisionId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE catalog.track_embedding, workflow.ai_generation_record,
      catalog.track_publication_event, workflow.change_request_item,
      workflow.change_request, workflow.review_decision, workflow.review_event, workflow.review_note,
      workflow.review_check_item, workflow.review_term_selection, workflow.review_metadata_draft,
      workflow.review_case, rights.copyright_check_event, rights.copyright_observation,
      rights.copyright_eligibility_review, rights.copyright_check, rights.rights_declaration,
      analysis.metadata_suggestion, analysis.provider_run, analysis.qc_issue,
      analysis.file_technical_result, analysis.processing_job, analysis.revision_analysis,
      catalog.track_term_assignment, catalog.taxonomy_term, catalog.track_metadata,
      catalog.audio_file, catalog.audio_asset, workflow.submission_event,
      workflow.submission_revision, workflow.submission, workflow.submission_batch,
      catalog.track_identifier, catalog.track, catalog.composition_identifier,
      catalog.composition, auth.access_audit_event, auth.team_access, auth.session,
      auth.account, auth."user" CASCADE`);

    userId = `emb-user-${randomUUID()}`;
    await pool.query(
      `INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
       VALUES ($1, 'Embedding Admin', $2, true, now(), now(), 'admin')`,
      [userId, `${randomUUID()}@soundvault.test`],
    );

    publishedTrackId = randomUUID();
    publishedRevisionId = randomUUID();
    const submissionId = randomUUID();

    // Insert published track
    await pool.query(
      `INSERT INTO catalog.track (
         id, asset_kind, title, description, publication_status,
         published_revision_id, published_by_user_id, published_at, created_by_user_id
       ) VALUES ($1, 'music', 'Diwali Dhol Beats', 'High energy celebration percussion', 'published', $2, $3, now(), $3)`,
      [publishedTrackId, publishedRevisionId, userId],
    );

    await pool.query(
      `INSERT INTO workflow.submission (
         id, track_id, owner_user_id, status, current_revision_id, latest_revision_number
       ) VALUES ($1, $2, $3, 'approved', $4, 1)`,
      [submissionId, publishedTrackId, userId, publishedRevisionId],
    );

    await pool.query(
      `INSERT INTO workflow.submission_revision (
         id, submission_id, revision_number, created_by_user_id, revision_status
       ) VALUES ($1, $2, 1, $3, 'accepted')`,
      [publishedRevisionId, submissionId, userId],
    );

    await pool.query(
      `INSERT INTO catalog.track_metadata (track_id, bpm, key_tonic, key_mode, vocal_state)
       VALUES ($1, 128, 'D', 'major', 'instrumental')`,
      [publishedTrackId],
    );
  });

  it("enqueues, claims, and completes track embedding", async () => {
    const result = await enqueueMissingEmbeddings(pool, {
      provider: "simulated",
      model: "gemini-embedding-2",
      modelVersion: "1.0",
      dimension: 768,
    });
    expect(result.enqueued).toBe(1);

    const job = await claimNextEmbeddingJob(pool, "test-worker", 5000, 2);
    expect(job).not.toBeNull();
    expect(job?.trackId).toBe(publishedTrackId);

    const provider = new SimulatedEmbeddingProvider({ dimension: 768 });
    const vector = await provider.embedDocument(job!.canonicalText);

    await completeEmbeddingJob(pool, {
      id: job!.id,
      workerId: "test-worker",
      embedding: vector,
      inputHash: job!.inputHash,
    });

    const readyEmbedding = await getTrackEmbedding(
      pool,
      publishedTrackId,
      "simulated",
      "gemini-embedding-2",
      768,
    );
    expect(readyEmbedding).not.toBeNull();
    expect(readyEmbedding?.embedding).toHaveLength(768);

    const status = await getEmbeddingStatus(pool);
    expect(status.publishedTracks).toBe(1);
    expect(status.readyEmbeddings).toBe(1);
    expect(status.queuedEmbeddings).toBe(0);
  });

  it("finds nearest published tracks using cosine similarity and excludes source", async () => {
    // Complete embedding for track 1
    const provider = new SimulatedEmbeddingProvider({ dimension: 768 });
    const v1 = await provider.embedDocument(
      "Diwali Dhol Beats high energy celebration",
    );

    await enqueueMissingEmbeddings(pool, {
      provider: "simulated",
      model: "gemini-embedding-2",
      modelVersion: "1.0",
      dimension: 768,
    });
    const job1 = await claimNextEmbeddingJob(pool, "w1", 5000, 2);
    await completeEmbeddingJob(pool, {
      id: job1!.id,
      workerId: "w1",
      embedding: v1,
      inputHash: job1!.inputHash,
    });

    // Insert track 2
    const track2Id = randomUUID();
    const rev2Id = randomUUID();
    const sub2Id = randomUUID();
    await pool.query(
      `INSERT INTO catalog.track (
         id, asset_kind, title, description, publication_status,
         published_revision_id, published_by_user_id, published_at, created_by_user_id
       ) VALUES ($1, 'music', 'Bhangra Dhol Festival', 'Punjabi celebration dhol rhythms', 'published', $2, $3, now(), $3)`,
      [track2Id, rev2Id, userId],
    );
    await pool.query(
      `INSERT INTO workflow.submission (id, track_id, owner_user_id, status, current_revision_id, latest_revision_number)
       VALUES ($1, $2, $3, 'approved', $4, 1)`,
      [sub2Id, track2Id, userId, rev2Id],
    );
    await pool.query(
      `INSERT INTO workflow.submission_revision (id, submission_id, revision_number, created_by_user_id, revision_status)
       VALUES ($1, $2, 1, $3, 'accepted')`,
      [rev2Id, sub2Id, userId],
    );

    await enqueueMissingEmbeddings(pool, {
      provider: "simulated",
      model: "gemini-embedding-2",
      modelVersion: "1.0",
      dimension: 768,
    });
    const job2 = await claimNextEmbeddingJob(pool, "w2", 5000, 2);
    const v2 = await provider.embedDocument(
      "Bhangra Dhol Festival Punjabi celebration",
    );
    await completeEmbeddingJob(pool, {
      id: job2!.id,
      workerId: "w2",
      embedding: v2,
      inputHash: job2!.inputHash,
    });

    // Search nearest to track 1 with track 1 excluded
    const nearest = await findNearestPublishedTracks(pool, {
      queryVector: v1,
      provider: "simulated",
      model: "gemini-embedding-2",
      dimension: 768,
      limit: 5,
      excludeTrackId: publishedTrackId,
    });

    expect(nearest).toHaveLength(1);
    expect(nearest[0]!.trackId).toBe(track2Id);
    expect(nearest[0]!.similarity).toBeGreaterThan(0);
  });
});
