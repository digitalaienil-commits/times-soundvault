import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { listPublishedTracks } from "@/lib/domain/catalog/repository";
import type { CurrentUser } from "@/types/auth";

import {
  approveReview,
  bulkApproveReviews,
  bulkPublishTracks,
  confirmReviewRejection,
  DecisionRepositoryError,
  publishApprovedTrack,
  recommendReviewRejection,
  requestReviewChanges,
  withdrawPublishedTrack,
} from "./repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

databaseDescribe("Section 8 decision repository", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE
      catalog.track_publication_event, workflow.change_request_item,
      workflow.change_request, workflow.review_decision,
      workflow.review_event, workflow.review_note, workflow.review_check_item,
      workflow.review_term_selection, workflow.review_metadata_draft,
      workflow.review_case, rights.copyright_check_event,
      rights.copyright_observation, rights.copyright_eligibility_review,
      rights.copyright_check, rights.rights_declaration,
      analysis.metadata_suggestion, analysis.provider_run, analysis.qc_issue,
      analysis.file_technical_result, analysis.processing_job,
      analysis.revision_analysis, catalog.track_term_assignment,
      catalog.taxonomy_term, catalog.track_metadata, catalog.audio_file,
      catalog.audio_asset, workflow.submission_event,
      workflow.submission_revision, workflow.submission,
      workflow.submission_batch, catalog.track_identifier, catalog.track,
      catalog.composition_identifier, catalog.composition,
      auth.access_audit_event, auth.team_access, auth.session, auth.account,
      auth."user" CASCADE`);
    await pool.query(
      `INSERT INTO catalog.taxonomy_term (id,category,slug,label) VALUES
       ('70000000-0000-4000-8000-000000000001','format','background-bed','Background Bed'),
       ('70000000-0000-4000-8000-000000000102','use_case','general-news','General News')`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function user(role: CurrentUser["role"]): Promise<CurrentUser> {
    const id = `${role}-${randomUUID()}`;
    const name = `${role} decision user`;
    const email = `${randomUUID()}@soundvault.test`;
    await pool.query(
      `INSERT INTO auth."user" (id,name,email,"emailVerified","createdAt","updatedAt",role)
       VALUES ($1,$2,$3,true,now(),now(),$4)`,
      [id, name, email, role],
    );
    return { id, name, email, initials: "DU", role, accessStatus: "active" };
  }

  async function readyReview(
    owner: CurrentUser,
    reviewer: CurrentUser,
    options: { attention?: boolean; copyrightOutcome?: string | null } = {},
  ) {
    const trackId = randomUUID();
    const submissionId = randomUUID();
    const revisionId = randomUUID();
    const reviewCaseId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.track
         (id,asset_kind,title,created_by_user_id)
       VALUES ($1,'music','Producer source title',$2)`,
      [trackId, owner.id],
    );
    await pool.query(
      `INSERT INTO workflow.submission
         (id,track_id,owner_user_id,status,current_revision_id,latest_revision_number)
       VALUES ($1,$2,$3,'in_review',NULL,0)`,
      [submissionId, trackId, owner.id],
    );
    await pool.query(
      `INSERT INTO workflow.submission_revision
         (id,submission_id,revision_number,created_by_user_id,revision_status,
          producer_metadata,submitted_at)
       VALUES ($1,$2,1,$3,'submitted',$4,now())`,
      [
        revisionId,
        submissionId,
        owner.id,
        { workingTitle: "Producer source title", format: "background_bed" },
      ],
    );
    await pool.query(
      `UPDATE workflow.submission
       SET current_revision_id=$2,latest_revision_number=1 WHERE id=$1`,
      [submissionId, revisionId],
    );
    await pool.query(
      `INSERT INTO rights.rights_declaration
         (id,submission_revision_id,master_rights_basis,composition_rights_basis,
          content_id_eligibility,declared_by_user_id)
       VALUES ($1,$2,'owned','exclusive_license','unknown',$3)`,
      [randomUUID(), revisionId, owner.id],
    );
    await pool.query(
      `INSERT INTO rights.copyright_check
         (id,submission_revision_id,track_id,status,outcome,created_by_user_id)
       VALUES ($1,$2,$3,'completed',$4,$5)`,
      [
        randomUUID(),
        revisionId,
        trackId,
        options.copyrightOutcome === undefined
          ? "no_claim_observed"
          : options.copyrightOutcome,
        reviewer.id,
      ],
    );
    await pool.query(
      `INSERT INTO workflow.review_case
         (id,submission_id,submission_revision_id,track_id,status,
          assigned_to_user_id,started_by_user_id,started_at,ready_for_decision_at)
       VALUES ($1,$2,$3,$4,'ready_for_decision',$5,$5,now(),now())`,
      [reviewCaseId, submissionId, revisionId, trackId, reviewer.id],
    );
    await pool.query(
      `INSERT INTO workflow.review_metadata_draft (review_case_id,fields)
       VALUES ($1,$2)`,
      [
        reviewCaseId,
        {
          title: {
            value: "Canonical election bed",
            sourceKind: "coordinator",
            sourceReference: null,
            reviewed: true,
            reviewedByUserId: reviewer.id,
            reviewedAt: new Date().toISOString(),
          },
          description: {
            value: "A governed news background bed.",
            sourceKind: "coordinator",
            sourceReference: null,
            reviewed: true,
            reviewedByUserId: reviewer.id,
            reviewedAt: new Date().toISOString(),
          },
          vocalState: {
            value: "instrumental",
            sourceKind: "coordinator",
            sourceReference: null,
            reviewed: true,
            reviewedByUserId: reviewer.id,
            reviewedAt: new Date().toISOString(),
          },
          format: {
            value: "background_bed",
            sourceKind: "coordinator",
            sourceReference: null,
            reviewed: true,
            reviewedByUserId: reviewer.id,
            reviewedAt: new Date().toISOString(),
          },
          underDialogue: {
            value: "yes",
            sourceKind: "coordinator",
            sourceReference: null,
            reviewed: true,
            reviewedByUserId: reviewer.id,
            reviewedAt: new Date().toISOString(),
          },
          endingType: {
            value: "clean_stop",
            sourceKind: "coordinator",
            sourceReference: null,
            reviewed: true,
            reviewedByUserId: reviewer.id,
            reviewedAt: new Date().toISOString(),
          },
        },
      ],
    );
    for (const termId of [
      "70000000-0000-4000-8000-000000000001",
      "70000000-0000-4000-8000-000000000102",
    ]) {
      await pool.query(
        `INSERT INTO workflow.review_term_selection
           (id,review_case_id,term_id,source_kind,decision,decided_by_user_id)
         VALUES ($1,$2,$3,'coordinator','selected',$4)`,
        [randomUUID(), reviewCaseId, termId, reviewer.id],
      );
    }
    for (const [index, code] of [
      "master_audio",
      "stems",
      "technical_qc",
      "metadata_core",
      "metadata_editorial",
      "rights",
      "copyright",
    ].entries()) {
      const attention = options.attention && index === 2;
      await pool.query(
        `INSERT INTO workflow.review_check_item
           (id,review_case_id,code,status,note,reviewed_by_user_id,reviewed_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())`,
        [
          randomUUID(),
          reviewCaseId,
          code,
          attention
            ? "attention"
            : code === "stems"
              ? "not_applicable"
              : "pass",
          attention ? "True peak needs an editorial judgement." : null,
          reviewer.id,
        ],
      );
    }
    return { trackId, submissionId, revisionId, reviewCaseId };
  }

  it("promotes canonical metadata without publishing and is idempotent", async () => {
    const producer = await user("music_producer");
    const coordinator = await user("coordinator");
    const subject = await readyReview(producer, coordinator);
    const first = await approveReview(pool, {
      reviewCaseId: subject.reviewCaseId,
      reviewVersion: 1,
      acknowledgeAttention: false,
      actor: coordinator,
    });
    const repeated = await approveReview(pool, {
      reviewCaseId: subject.reviewCaseId,
      reviewVersion: 1,
      acknowledgeAttention: false,
      actor: coordinator,
    });
    expect(first.idempotent).toBe(false);
    expect(repeated).toMatchObject({
      decisionId: first.decisionId,
      idempotent: true,
    });
    const stored = await pool.query(
      `SELECT submission.status,revision.revision_status,review.status AS review_status,
              track.title,track.publication_status,metadata.vocal_state,
              metadata.under_dialogue,metadata.ending_type,metadata.metadata_version
       FROM workflow.submission submission
       JOIN workflow.submission_revision revision ON revision.id=submission.current_revision_id
       JOIN workflow.review_case review ON review.submission_id=submission.id
       JOIN catalog.track track ON track.id=submission.track_id
       JOIN catalog.track_metadata metadata ON metadata.track_id=track.id
       WHERE submission.id=$1`,
      [subject.submissionId],
    );
    expect(stored.rows[0]).toMatchObject({
      status: "approved",
      revision_status: "accepted",
      review_status: "decisioned",
      title: "Canonical election bed",
      publication_status: "unpublished",
      vocal_state: "instrumental",
      under_dialogue: true,
      ending_type: "clean_stop",
      metadata_version: "1",
    });
    expect(await listPublishedTracks(pool)).toEqual([]);
  });

  it("requires a serious acknowledgement for attention-item approval", async () => {
    const producer = await user("music_producer");
    const coordinator = await user("coordinator");
    const subject = await readyReview(producer, coordinator, {
      attention: true,
    });
    await expect(
      approveReview(pool, {
        reviewCaseId: subject.reviewCaseId,
        reviewVersion: 1,
        acknowledgeAttention: true,
        attentionNote: "Too short",
        actor: coordinator,
      }),
    ).rejects.toMatchObject({ code: "INCOMPLETE" });
    await expect(
      approveReview(pool, {
        reviewCaseId: subject.reviewCaseId,
        reviewVersion: 1,
        acknowledgeAttention: true,
        attentionNote:
          "The peak is intentional, controlled and acceptable for this editorial use.",
        actor: coordinator,
      }),
    ).resolves.toMatchObject({ decisionType: "approve" });
  });

  it("creates Producer-visible structured changes without leaking internal notes", async () => {
    const producer = await user("music_producer");
    const coordinator = await user("coordinator");
    const subject = await readyReview(producer, coordinator);
    await requestReviewChanges(pool, {
      reviewCaseId: subject.reviewCaseId,
      reviewVersion: 1,
      actor: coordinator,
      producerSummary: "Replace the clipped Master and confirm ownership.",
      items: [
        { category: "audio", instruction: "Upload a clean Master." },
        { category: "rights", instruction: "Confirm composition rights." },
      ],
    });
    const stored = await pool.query(
      `SELECT submission.status,request.producer_summary,count(item.id)::text AS item_count,
              decision.internal_note
       FROM workflow.submission submission
       JOIN workflow.change_request request ON request.submission_id=submission.id
       JOIN workflow.review_decision decision ON decision.id=request.review_decision_id
       JOIN workflow.change_request_item item ON item.change_request_id=request.id
       WHERE submission.id=$1
       GROUP BY submission.status,request.producer_summary,decision.internal_note`,
      [subject.submissionId],
    );
    expect(stored.rows[0]).toMatchObject({
      status: "changes_requested",
      producer_summary: "Replace the clipped Master and confirm ownership.",
      item_count: "2",
      internal_note: null,
    });
  });

  it("keeps recommendation pending until Admin confirms rejection", async () => {
    const producer = await user("music_producer");
    const coordinator = await user("coordinator");
    const admin = await user("admin");
    const subject = await readyReview(producer, coordinator);
    const recommendation = await recommendReviewRejection(pool, {
      reviewCaseId: subject.reviewCaseId,
      reviewVersion: 1,
      reasonCategory: "rights",
      internalReason: "The ownership evidence conflicts with the declaration.",
      actor: coordinator,
    });
    await expect(
      confirmReviewRejection(pool, {
        recommendationId: recommendation.decisionId,
        producerReason: "Final reason",
        actor: coordinator,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const pending = await pool.query(
      `SELECT status FROM workflow.submission WHERE id=$1`,
      [subject.submissionId],
    );
    expect(pending.rows[0]?.status).toBe("rejection_recommended");
    await confirmReviewRejection(pool, {
      recommendationId: recommendation.decisionId,
      producerReason: "Ownership could not be verified.",
      adminNote: "Reviewed against the supplied rights packet.",
      actor: admin,
    });
    const final = await pool.query(
      `SELECT submission.status,revision.revision_status
       FROM workflow.submission submission
       JOIN workflow.submission_revision revision ON revision.id=submission.current_revision_id
       WHERE submission.id=$1`,
      [subject.submissionId],
    );
    expect(final.rows[0]).toMatchObject({
      status: "rejected",
      revision_status: "rejected",
    });
  });

  it("publishes only through the gate and preserves withdrawal history", async () => {
    const producer = await user("music_producer");
    const coordinator = await user("coordinator");
    const admin = await user("admin");
    const subject = await readyReview(producer, coordinator, {
      copyrightOutcome: "third_party_claim_observed",
    });
    await approveReview(pool, {
      reviewCaseId: subject.reviewCaseId,
      reviewVersion: 1,
      acknowledgeAttention: false,
      actor: coordinator,
    });
    await expect(
      publishApprovedTrack(pool, {
        submissionId: subject.submissionId,
        actor: coordinator,
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_BLOCKED" });
    await pool.query(
      `UPDATE rights.copyright_check SET outcome='no_claim_observed'
       WHERE submission_revision_id=$1`,
      [subject.revisionId],
    );
    await publishApprovedTrack(pool, {
      submissionId: subject.submissionId,
      actor: coordinator,
    });
    expect((await listPublishedTracks(pool)).map((track) => track.id)).toEqual([
      subject.trackId,
    ]);
    expect(() =>
      withdrawPublishedTrack(pool, {
        submissionId: subject.submissionId,
        reason: "Temporary policy review",
        actor: coordinator,
      }),
    ).toThrowError(DecisionRepositoryError);
    await withdrawPublishedTrack(pool, {
      submissionId: subject.submissionId,
      reason: "Temporary policy review",
      actor: admin,
    });
    expect(await listPublishedTracks(pool)).toEqual([]);
    await publishApprovedTrack(pool, {
      submissionId: subject.submissionId,
      reason: "Policy review completed",
      actor: admin,
    });
    const events = await pool.query(
      `SELECT event_type,reason FROM catalog.track_publication_event
       WHERE track_id=$1 ORDER BY created_at,id`,
      [subject.trackId],
    );
    expect(events.rows).toEqual([
      { event_type: "published", reason: null },
      { event_type: "withdrawn", reason: "Temporary policy review" },
      { event_type: "republished", reason: "Policy review completed" },
    ]);
  });

  it("allows exactly one concurrent primary decision", async () => {
    const producer = await user("music_producer");
    const coordinator = await user("coordinator");
    const subject = await readyReview(producer, coordinator);
    const results = await Promise.allSettled([
      approveReview(pool, {
        reviewCaseId: subject.reviewCaseId,
        reviewVersion: 1,
        acknowledgeAttention: false,
        actor: coordinator,
      }),
      requestReviewChanges(pool, {
        reviewCaseId: subject.reviewCaseId,
        reviewVersion: 1,
        producerSummary: "Revise the Master.",
        items: [{ category: "audio", instruction: "Upload a new Master." }],
        actor: coordinator,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const count = await pool.query(
      `SELECT count(*)::text AS count FROM workflow.review_decision
       WHERE review_case_id=$1 AND decision_type IN ('approve','request_changes','recommend_reject')`,
      [subject.reviewCaseId],
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("rolls back bulk approval and bulk publication atomically", async () => {
    const producer = await user("music_producer");
    const coordinator = await user("coordinator");
    const clean = await readyReview(producer, coordinator);
    const attention = await readyReview(producer, coordinator, {
      attention: true,
    });
    await expect(
      bulkApproveReviews(pool, {
        items: [
          { id: clean.reviewCaseId, version: 1 },
          { id: attention.reviewCaseId, version: 1 },
        ],
        actor: coordinator,
      }),
    ).rejects.toMatchObject({ code: "INCOMPLETE" });
    const decisionCount = await pool.query(
      `SELECT count(*)::text AS count FROM workflow.review_decision`,
    );
    expect(decisionCount.rows[0]?.count).toBe("0");

    await approveReview(pool, {
      reviewCaseId: clean.reviewCaseId,
      reviewVersion: 1,
      acknowledgeAttention: false,
      actor: coordinator,
    });
    await approveReview(pool, {
      reviewCaseId: attention.reviewCaseId,
      reviewVersion: 1,
      acknowledgeAttention: true,
      attentionNote:
        "The warning is intentional and acceptable for controlled internal use.",
      actor: coordinator,
    });
    await pool.query(
      `UPDATE rights.copyright_check SET outcome='ownership_conflict'
       WHERE submission_revision_id=$1`,
      [attention.revisionId],
    );
    await expect(
      bulkPublishTracks(pool, {
        submissionIds: [clean.submissionId, attention.submissionId],
        actor: coordinator,
      }),
    ).rejects.toMatchObject({ code: "PUBLICATION_BLOCKED" });
    expect(await listPublishedTracks(pool)).toEqual([]);
  });
});
