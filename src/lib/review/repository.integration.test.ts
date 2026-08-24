import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  createDraftSubmission,
  createSubmissionRevision,
  transitionSubmissionStatus,
} from "@/lib/domain/submissions/repository";
import type { CurrentUser } from "@/types/auth";

import {
  REVIEW_CONFLICT_MESSAGE,
  buildReviewDecisionPacket,
  loadReviewAggregate,
  markReadyForDecision,
  reassignReview,
  releaseReview,
  reopenReview,
  saveChecklistDecision,
  saveMetadataDecision,
  saveTermDecision,
  startOrClaimReview,
} from "./repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

databaseDescribe("Coordinator review repository", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE
      workflow.review_event, workflow.review_note, workflow.review_check_item,
      workflow.review_term_selection, workflow.review_metadata_draft, workflow.review_case,
      rights.copyright_check_event, rights.copyright_observation,
      rights.copyright_eligibility_review, rights.copyright_check,
      rights.rights_declaration, analysis.metadata_suggestion,
      analysis.provider_run, analysis.qc_issue, analysis.file_technical_result,
      analysis.processing_job, analysis.revision_analysis,
      catalog.track_term_assignment, catalog.taxonomy_term, catalog.track_metadata,
      catalog.audio_file, catalog.audio_asset, workflow.submission_event,
      workflow.submission_revision, workflow.submission, workflow.submission_batch,
      catalog.track_identifier, catalog.track, catalog.composition_identifier,
      catalog.composition, auth.access_audit_event, auth.team_access,
      auth.session, auth.account, auth."user" CASCADE`);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function user(role: CurrentUser["role"]): Promise<CurrentUser> {
    const id = `${role}-${randomUUID()}`;
    const name = `${role} reviewer`;
    const email = `${randomUUID()}@soundvault.test`;
    await pool.query(
      `INSERT INTO auth."user" (id,name,email,"emailVerified","createdAt","updatedAt",role)
       VALUES ($1,$2,$3,true,now(),now(),$4)`,
      [id, name, email, role],
    );
    await pool.query(
      `INSERT INTO auth.team_access
       (id,normalized_email,display_name,role,status,auth_user_id,provider,provider_account_id,activated_at)
       VALUES ($1,$2,$3,$4,'active',$5,'local',$5,now())`,
      [randomUUID(), email, name, role, id],
    );
    return { id, name, email, initials: "RR", role, accessStatus: "active" };
  }

  async function reviewable(owner: CurrentUser) {
    const submission = await createDraftSubmission(pool, {
      ownerUserId: owner.id,
      actorUserId: owner.id,
      title: "Election tension bed",
    });
    const revision = await createSubmissionRevision(pool, {
      submissionId: submission.id,
      submissionOwnerUserId: owner.id,
      actorUserId: owner.id,
      producerMetadata: {
        workingTitle: "Election tension bed",
        format: "background_bed",
      },
    });
    for (const [from, to] of [
      ["draft", "submitted"],
      ["submitted", "processing"],
      ["processing", "ready_for_review"],
    ] as const) {
      await transitionSubmissionStatus(pool, {
        submissionId: submission.id,
        expectedStatus: from,
        nextStatus: to,
        actorUserId: owner.id,
      });
    }
    return { submission, revision };
  }

  it("atomically creates one revision-bound case and prevents a second claim", async () => {
    const producer = await user("music_producer");
    const first = await user("coordinator");
    const second = await user("coordinator");
    const { submission, revision } = await reviewable(producer);

    const results = await Promise.allSettled([
      startOrClaimReview(pool, submission.id, first.id),
      startOrClaimReview(pool, submission.id, second.id),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const stored = await pool.query<{
      count: string;
      submission_revision_id: string;
      submission_status: string;
    }>(
      `SELECT count(*)::text AS count, min(review.submission_revision_id::text)::uuid AS submission_revision_id,
              min(submission.status) AS submission_status
       FROM workflow.review_case review JOIN workflow.submission submission ON submission.id=review.submission_id
       GROUP BY submission.id`,
    );
    expect(stored.rows[0]).toMatchObject({
      count: "1",
      submission_revision_id: revision.id,
      submission_status: "in_review",
    });
  });

  it("keeps reviewed provenance separate and rejects stale updates", async () => {
    const producer = await user("music_producer");
    const coordinator = await user("coordinator");
    const { submission } = await reviewable(producer);
    const reviewCaseId = await startOrClaimReview(
      pool,
      submission.id,
      coordinator.id,
    );
    const aggregate = await loadReviewAggregate(
      pool,
      submission.id,
      coordinator,
    );
    expect(aggregate?.editable).toBe(true);
    const version = aggregate!.reviewCase!.rowVersion;
    const decision = {
      value: "Trusted review title",
      sourceKind: "coordinator" as const,
      sourceReference: null,
      reviewed: true as const,
      reviewedByUserId: coordinator.id,
      reviewedAt: new Date().toISOString(),
    };
    await saveMetadataDecision(pool, {
      reviewCaseId,
      fieldName: "title",
      decision,
      expectedVersion: version,
      actor: coordinator,
    });
    await expect(
      saveMetadataDecision(pool, {
        reviewCaseId,
        fieldName: "description",
        decision,
        expectedVersion: version,
        actor: coordinator,
      }),
    ).rejects.toThrow(REVIEW_CONFLICT_MESSAGE);

    const track = await pool.query<{ title: string }>(
      `SELECT title FROM catalog.track WHERE id=$1`,
      [submission.trackId],
    );
    const draft = await pool.query<{ fields: Record<string, unknown> }>(
      `SELECT fields FROM workflow.review_metadata_draft WHERE review_case_id=$1`,
      [reviewCaseId],
    );
    expect(track.rows[0]?.title).toBe("Election tension bed");
    expect(draft.rows[0]?.fields).toMatchObject({ title: decision });
  });

  it("lets another Coordinator inspect but not edit an assigned review", async () => {
    const producer = await user("music_producer");
    const assignee = await user("coordinator");
    const observer = await user("coordinator");
    const { submission } = await reviewable(producer);
    const reviewCaseId = await startOrClaimReview(
      pool,
      submission.id,
      assignee.id,
    );
    const aggregate = await loadReviewAggregate(pool, submission.id, observer);
    expect(aggregate?.editable).toBe(false);
    await expect(
      saveMetadataDecision(pool, {
        reviewCaseId,
        fieldName: "title",
        decision: {
          value: "Observer edit",
          sourceKind: "coordinator",
          sourceReference: null,
          reviewed: true,
          reviewedByUserId: observer.id,
          reviewedAt: new Date().toISOString(),
        },
        expectedVersion: aggregate!.reviewCase!.rowVersion,
        actor: observer,
      }),
    ).rejects.toMatchObject({ code: "READ_ONLY" });
  });

  it("releases, reclaims and lets Admin reassign without losing history", async () => {
    const producer = await user("music_producer");
    const first = await user("coordinator");
    const second = await user("coordinator");
    const admin = await user("admin");
    const { submission } = await reviewable(producer);
    const reviewCaseId = await startOrClaimReview(
      pool,
      submission.id,
      first.id,
    );
    let aggregate = await loadReviewAggregate(pool, submission.id, first);
    await releaseReview(
      pool,
      reviewCaseId,
      aggregate!.reviewCase!.rowVersion,
      first,
    );
    await startOrClaimReview(pool, submission.id, second.id);
    aggregate = await loadReviewAggregate(pool, submission.id, second);
    await expect(
      releaseReview(
        pool,
        reviewCaseId,
        aggregate!.reviewCase!.rowVersion,
        first,
      ),
    ).rejects.toMatchObject({ code: "READ_ONLY" });
    await reassignReview(
      pool,
      reviewCaseId,
      admin.id,
      aggregate!.reviewCase!.rowVersion,
      admin,
    );
    const events = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM workflow.review_event WHERE review_case_id=$1 ORDER BY created_at,id`,
      [reviewCaseId],
    );
    expect(events.rows.map((row) => row.event_type)).toEqual(
      expect.arrayContaining(["claimed", "released", "reassigned"]),
    );
  });

  it("locks a complete attention-aware review, keeps Submission in review, and reopens", async () => {
    const producer = await user("music_producer");
    const coordinator = await user("coordinator");
    const { submission } = await reviewable(producer);
    const reviewCaseId = await startOrClaimReview(
      pool,
      submission.id,
      coordinator.id,
    );

    async function version() {
      const result = await pool.query<{ row_version: string }>(
        `SELECT row_version FROM workflow.review_case WHERE id=$1`,
        [reviewCaseId],
      );
      return Number(result.rows[0]!.row_version);
    }

    for (const [fieldName, value] of [
      ["title", "Election tension bed"],
      ["vocalState", "instrumental"],
      ["format", "background_bed"],
    ] as const) {
      await saveMetadataDecision(pool, {
        reviewCaseId,
        fieldName,
        expectedVersion: await version(),
        actor: coordinator,
        decision: {
          value,
          sourceKind: "producer",
          sourceReference: submission.currentRevisionId,
          reviewed: true,
          reviewedByUserId: coordinator.id,
          reviewedAt: new Date().toISOString(),
        },
      });
    }
    const useCaseId = randomUUID();
    await pool.query(
      `INSERT INTO catalog.taxonomy_term (id,category,slug,label)
       VALUES ($1,'use_case','breaking-news','Breaking News')`,
      [useCaseId],
    );
    await saveTermDecision(pool, {
      reviewCaseId,
      termId: useCaseId,
      sourceKind: "coordinator",
      decision: "selected",
      expectedVersion: await version(),
      actor: coordinator,
    });
    const checks = await pool.query<{ code: string; status: string }>(
      `SELECT code,status FROM workflow.review_check_item WHERE review_case_id=$1 ORDER BY code`,
      [reviewCaseId],
    );
    for (const check of checks.rows) {
      if (check.status === "not_applicable") continue;
      await saveChecklistDecision(pool, {
        reviewCaseId,
        code: check.code,
        status: check.code === "rights" ? "attention" : "pass",
        note:
          check.code === "rights"
            ? "Composition ownership needs confirmation."
            : undefined,
        expectedVersion: await version(),
        actor: coordinator,
      });
    }
    await markReadyForDecision(
      pool,
      reviewCaseId,
      await version(),
      coordinator,
    );
    const packet = await buildReviewDecisionPacket(pool, reviewCaseId);
    expect(packet).toMatchObject({
      reviewStatus: "ready_for_decision",
      submissionId: submission.id,
      attentionItems: [{ code: "rights", status: "attention" }],
    });
    const workflow = await pool.query<{ status: string }>(
      `SELECT status FROM workflow.submission WHERE id=$1`,
      [submission.id],
    );
    expect(workflow.rows[0]?.status).toBe("in_review");
    await expect(
      saveMetadataDecision(pool, {
        reviewCaseId,
        fieldName: "description",
        expectedVersion: packet.reviewVersion,
        actor: coordinator,
        decision: {
          value: "Locked mutation",
          sourceKind: "coordinator",
          sourceReference: null,
          reviewed: true,
          reviewedByUserId: coordinator.id,
          reviewedAt: new Date().toISOString(),
        },
      }),
    ).rejects.toMatchObject({ code: "READ_ONLY" });
    await reopenReview(pool, reviewCaseId, packet.reviewVersion, coordinator);
    expect(
      (await loadReviewAggregate(pool, submission.id, coordinator))?.editable,
    ).toBe(true);
  });
});
