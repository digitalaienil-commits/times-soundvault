import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  enqueuePlaybackArtifacts,
  getPublishedMediaObject,
  getPublishedPlaybackDescriptor,
  listPublishedPackageSources,
  packageSourceFingerprint,
} from "./repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

databaseDescribe("Section 10 PostgreSQL media delivery", () => {
  let pool: Pool;
  let trackId: string;
  let revisionId: string;
  let assetId: string;
  let sourceFileId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE media.delivery_job,media.download_package,
      media.playback_artifact,catalog.track_publication_event,
      workflow.change_request_item,workflow.change_request,
      workflow.review_decision,workflow.review_event,workflow.review_note,
      workflow.review_check_item,workflow.review_term_selection,
      workflow.review_metadata_draft,workflow.review_case,
      rights.copyright_check_event,rights.copyright_observation,
      rights.copyright_eligibility_review,rights.copyright_check,
      rights.rights_declaration,analysis.metadata_suggestion,
      analysis.provider_run,analysis.qc_issue,analysis.file_technical_result,
      analysis.processing_job,analysis.revision_analysis,
      catalog.track_term_assignment,catalog.taxonomy_term,
      catalog.track_metadata,catalog.audio_file,catalog.audio_asset,
      workflow.submission_event,workflow.submission_revision,
      workflow.submission,workflow.submission_batch,catalog.track_identifier,
      catalog.track,catalog.composition_identifier,catalog.composition,
      auth.access_audit_event,auth.team_access,auth.session,auth.account,
      auth."user" CASCADE`);
    const userId = `media-${randomUUID()}`;
    trackId = randomUUID();
    revisionId = randomUUID();
    assetId = randomUUID();
    sourceFileId = randomUUID();
    const submissionId = randomUUID();
    await pool.query(
      `INSERT INTO auth."user"
         (id,name,email,"emailVerified","createdAt","updatedAt",role)
       VALUES ($1,'Media owner',$2,true,now(),now(),'music_producer')`,
      [userId, `${randomUUID()}@soundvault.test`],
    );
    await pool.query(
      `INSERT INTO catalog.track
         (id,title,created_by_user_id)
       VALUES ($1,'Published Media Track',$2)`,
      [trackId, userId],
    );
    await pool.query(
      `INSERT INTO workflow.submission
         (id,track_id,owner_user_id,status,current_revision_id,latest_revision_number)
       VALUES ($1,$2,$3,'approved',NULL,0)`,
      [submissionId, trackId, userId],
    );
    await pool.query(
      `INSERT INTO workflow.submission_revision
         (id,submission_id,revision_number,created_by_user_id,
          revision_status,submitted_at)
       VALUES ($1,$2,1,$3,'accepted',now())`,
      [revisionId, submissionId, userId],
    );
    await pool.query(
      "UPDATE workflow.submission SET current_revision_id=$2,latest_revision_number=1 WHERE id=$1",
      [submissionId, revisionId],
    );
    await pool.query(
      `INSERT INTO catalog.audio_asset
         (id,track_id,submission_revision_id,asset_role,sort_order)
       VALUES ($1,$2,$3,'master',0)`,
      [assetId, trackId, revisionId],
    );
    await pool.query(
      `INSERT INTO catalog.audio_file
         (id,audio_asset_id,file_role,original_filename,storage_backend,
          storage_key,content_type,container_format,codec,byte_size,
          checksum_sha256,duration_ms,sample_rate_hz,channels,technical_status)
       VALUES ($1,$2,'source','Master.wav','local',
          $3,'audio/wav','wav','pcm_s24le',1024,$4,1000,48000,2,'available')`,
      [
        sourceFileId,
        assetId,
        `submissions/${submissionId}/revisions/1/${sourceFileId}.wav`,
        "a".repeat(64),
      ],
    );
    await pool.query(
      `UPDATE catalog.track
       SET publication_status='published',published_revision_id=$2,
           published_by_user_id=$3,published_at=now()
       WHERE id=$1`,
      [trackId, revisionId, userId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("idempotently enqueues canonical Master preview work", async () => {
    await enqueuePlaybackArtifacts(pool, {
      trackId,
      revisionId,
      profileVersion: 1,
      maxAttempts: 5,
    });
    await enqueuePlaybackArtifacts(pool, {
      trackId,
      revisionId,
      profileVersion: 1,
      maxAttempts: 5,
    });
    const counts = await pool.query<{ artifacts: string; jobs: string }>(
      `SELECT
        (SELECT count(*) FROM media.playback_artifact)::text AS artifacts,
        (SELECT count(*) FROM media.delivery_job)::text AS jobs`,
    );
    expect(counts.rows[0]).toEqual({ artifacts: "1", jobs: "1" });
  });

  it("returns a safe ready descriptor then fails closed on withdrawal", async () => {
    const previewId = randomUUID();
    const artifactId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.audio_file
         (id,audio_asset_id,file_role,original_filename,storage_backend,
          storage_key,content_type,container_format,codec,byte_size,
          checksum_sha256,duration_ms,sample_rate_hz,channels,technical_status)
       VALUES ($1,$2,'preview',$3,'local',$4,'audio/mpeg','mp3','mp3',
          512,$5,1000,48000,2,'available')`,
      [
        previewId,
        assetId,
        `soundvault-preview-${assetId}.mp3`,
        `generated/previews/${assetId}.mp3`,
        "b".repeat(64),
      ],
    );
    await pool.query(
      `INSERT INTO media.playback_artifact
         (id,track_id,submission_revision_id,audio_asset_id,
          source_audio_file_id,preview_audio_file_id,status,profile_version,
          waveform_peaks,waveform_peak_count,ready_at)
       VALUES ($1,$2,$3,$4,$5,$6,'ready',1,ARRAY[-2,3]::smallint[],1,now())`,
      [artifactId, trackId, revisionId, assetId, sourceFileId, previewId],
    );
    const descriptor = await getPublishedPlaybackDescriptor(trackId, pool);
    expect(descriptor).toMatchObject({
      trackId,
      status: "ready",
      masterPlaybackReady: true,
    });
    expect(JSON.stringify(descriptor)).not.toContain("storage");
    expect(
      await getPublishedMediaObject(trackId, assetId, "source", pool),
    ).toMatchObject({ originalFilename: "Master.wav" });
    await pool.query(
      "UPDATE catalog.track SET publication_status='withdrawn' WHERE id=$1",
      [trackId],
    );
    expect(await getPublishedPlaybackDescriptor(trackId, pool)).toBeNull();
    expect(
      await getPublishedMediaObject(trackId, assetId, "source", pool),
    ).toBeNull();
  });

  it("fingerprints the ordered immutable package sources", async () => {
    const subject = await listPublishedPackageSources(pool, trackId, "full");
    expect(subject?.sources).toHaveLength(1);
    expect(
      packageSourceFingerprint(revisionId, "full", subject?.sources ?? []),
    ).toMatch(/^[0-9a-f]{64}$/);
  });
});
