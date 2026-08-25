import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import { hasPermission, type Permission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/types/auth";
import type {
  ApprovedPublicationItem,
  ChangeRequestItemInput,
  DecisionSnapshot,
  PublicationEventView,
  PublicationGateInput,
  PublicationGateResult,
  ReviewDecisionResult,
  SubmissionDecisionSummary,
} from "@/types/decisions";
import type {
  ReviewChecklistItem,
  ReviewDecisionPacket,
  ReviewFieldDecision,
} from "@/types/review";

import { evaluatePublicationGate } from "./publication-gate";

type Queryable = Pick<Pool | PoolClient, "query">;

export const DECISION_CONFLICT_MESSAGE =
  "This review changed before the decision completed. Refresh and try again.";

export class DecisionRepositoryError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "INCOMPLETE"
      | "PUBLICATION_BLOCKED",
    message: string,
    public readonly blockers: string[] = [],
  ) {
    super(message);
    this.name = "DecisionRepositoryError";
  }
}

function assertPermission(actor: CurrentUser, permission: Permission) {
  if (!hasPermission(actor.role, permission)) {
    throw new DecisionRepositoryError(
      "FORBIDDEN",
      "You do not have permission to complete this action.",
    );
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

interface LockedReview extends QueryResultRow {
  id: string;
  submission_id: string;
  submission_revision_id: string;
  track_id: string;
  review_status: string;
  row_version: string;
  submission_status: string;
  current_revision_id: string;
  revision_status: string;
}

async function lockReview(
  client: Queryable,
  reviewCaseId: string,
): Promise<LockedReview> {
  const result = await client.query<LockedReview>(
    `SELECT review.id, review.submission_id, review.submission_revision_id,
            review.track_id, review.status AS review_status, review.row_version,
            submission.status AS submission_status, submission.current_revision_id,
            revision.revision_status
     FROM workflow.review_case review
     JOIN workflow.submission submission ON submission.id=review.submission_id
     JOIN workflow.submission_revision revision ON revision.id=review.submission_revision_id
     JOIN catalog.track track ON track.id=review.track_id
     WHERE review.id=$1
     FOR UPDATE OF review, submission, revision, track`,
    [reviewCaseId],
  );
  const row = result.rows[0];
  if (!row)
    throw new DecisionRepositoryError("NOT_FOUND", "Review was not found.");
  return row;
}

interface ExistingDecision extends QueryResultRow {
  id: string;
  decision_type: ReviewDecisionResult["decisionType"];
  submission_id: string;
  track_id: string;
}

async function existingPrimaryDecision(
  client: Queryable,
  reviewCaseId: string,
): Promise<ExistingDecision | null> {
  const result = await client.query<ExistingDecision>(
    `SELECT id, decision_type, submission_id, track_id
     FROM workflow.review_decision
     WHERE review_case_id=$1
       AND decision_type IN ('approve','request_changes','recommend_reject')
     LIMIT 1`,
    [reviewCaseId],
  );
  return result.rows[0] ?? null;
}

function idempotentResult(
  existing: ExistingDecision,
  expectedType: ReviewDecisionResult["decisionType"],
): ReviewDecisionResult | null {
  if (existing.decision_type !== expectedType) return null;
  return {
    decisionId: existing.id,
    decisionType: existing.decision_type,
    submissionId: existing.submission_id,
    trackId: existing.track_id,
    idempotent: true,
  };
}

function assertDecisionReady(review: LockedReview, expectedVersion: number) {
  if (
    review.review_status !== "ready_for_decision" ||
    review.submission_status !== "in_review" ||
    review.current_revision_id !== review.submission_revision_id ||
    review.revision_status !== "submitted"
  ) {
    throw new DecisionRepositoryError("CONFLICT", DECISION_CONFLICT_MESSAGE);
  }
  if (Number(review.row_version) !== expectedVersion) {
    throw new DecisionRepositoryError("CONFLICT", DECISION_CONFLICT_MESSAGE);
  }
}

interface PacketData {
  fields: Record<string, ReviewFieldDecision>;
  terms: Array<{
    termId: string;
    category: string;
    slug: string;
    label: string;
    sourceKind: string;
  }>;
  checklist: ReviewChecklistItem[];
  rights: Record<string, unknown> | null;
  copyright: Record<string, unknown> | null;
}

async function loadAuthoritativePacket(
  client: Queryable,
  review: LockedReview,
): Promise<PacketData> {
  const draft = await client.query<
    { fields: Record<string, ReviewFieldDecision> } & QueryResultRow
  >(
    `SELECT fields FROM workflow.review_metadata_draft WHERE review_case_id=$1`,
    [review.id],
  );
  const terms = await client.query<
    {
      term_id: string;
      category: string;
      slug: string;
      label: string;
      source_kind: string;
    } & QueryResultRow
  >(
    `SELECT selection.term_id, term.category, term.slug, term.label, selection.source_kind
     FROM workflow.review_term_selection selection
     JOIN catalog.taxonomy_term term ON term.id=selection.term_id AND term.is_active=true
     WHERE selection.review_case_id=$1 AND selection.decision='selected'
     ORDER BY term.category, term.slug, term.id`,
    [review.id],
  );
  const checklist = await client.query<
    {
      code: ReviewChecklistItem["code"];
      status: ReviewChecklistItem["status"];
      note: string | null;
      reviewed_at: Date | null;
    } & QueryResultRow
  >(
    `SELECT code,status,note,reviewed_at
     FROM workflow.review_check_item WHERE review_case_id=$1 ORDER BY code`,
    [review.id],
  );
  const rights = await client.query<Record<string, unknown> & QueryResultRow>(
    `SELECT master_rights_basis AS "masterRightsBasis",
            composition_rights_basis AS "compositionRightsBasis",
            valid_until AS "validUntil", one_stop_clearance AS "oneStopClearance"
     FROM rights.rights_declaration WHERE submission_revision_id=$1`,
    [review.submission_revision_id],
  );
  const copyright = await client.query<
    Record<string, unknown> & QueryResultRow
  >(
    `SELECT status,outcome,eligibility_status AS "eligibilityStatus",
            readiness_status AS "readinessStatus"
     FROM rights.copyright_check
     WHERE submission_revision_id=$1 AND is_current=true`,
    [review.submission_revision_id],
  );
  return {
    fields: draft.rows[0]?.fields ?? {},
    terms: terms.rows.map((row) => ({
      termId: row.term_id,
      category: row.category,
      slug: row.slug,
      label: row.label,
      sourceKind: row.source_kind,
    })),
    checklist: checklist.rows.map((row) => ({
      code: row.code,
      status: row.status,
      note: row.note,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
    })),
    rights: rights.rows[0] ?? null,
    copyright: copyright.rows[0] ?? null,
  };
}

function field(packet: PacketData, name: string): unknown {
  return packet.fields[name]?.value ?? null;
}

function safeSnapshot(
  packet: PacketData,
  reviewVersion: number,
): DecisionSnapshot {
  const fields = Object.fromEntries(
    Object.entries(packet.fields).map(([name, decision]) => [
      name,
      { value: decision.value, sourceKind: decision.sourceKind },
    ]),
  );
  return {
    reviewVersion,
    fields,
    terms: packet.terms.map(({ termId, category, label, sourceKind }) => ({
      termId,
      category,
      label,
      sourceKind,
    })),
    checklist: packet.checklist,
    rights: packet.rights,
    copyright: packet.copyright,
  };
}

function assertApprovalPacket(packet: PacketData) {
  const title = field(packet, "title");
  const vocalState = field(packet, "vocalState");
  const format = field(packet, "format");
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof vocalState !== "string" ||
    vocalState === "unknown" ||
    typeof format !== "string"
  ) {
    throw new DecisionRepositoryError(
      "INCOMPLETE",
      "Canonical title, vocal state and Format must be reviewed before approval.",
    );
  }
  const formats = packet.terms.filter((term) => term.category === "format");
  if (
    formats.length !== 1 ||
    formats[0]!.slug.replaceAll("-", "_") !== format
  ) {
    throw new DecisionRepositoryError(
      "INCOMPLETE",
      "The reviewed Format must match exactly one selected active Format term.",
    );
  }
  if (!packet.terms.some((term) => term.category === "use_case")) {
    throw new DecisionRepositoryError(
      "INCOMPLETE",
      "Select at least one active Use Case before approval.",
    );
  }
}

function triStateBoolean(value: unknown): boolean | null {
  return value === "yes" ? true : value === "no" ? false : null;
}

async function insertDecision(
  client: Queryable,
  input: {
    id: string;
    review: LockedReview;
    type: ReviewDecisionResult["decisionType"];
    actor: CurrentUser;
    snapshot: DecisionSnapshot;
    parentDecisionId?: string;
    reasonCategory?: string;
    producerSummary?: string;
    internalNote?: string;
    attentionAcknowledgement?: string;
  },
) {
  await client.query(
    `INSERT INTO workflow.review_decision
       (id,review_case_id,submission_id,submission_revision_id,track_id,
        decision_type,parent_decision_id,reason_category,producer_summary,
        internal_note,attention_acknowledgement,decision_packet,decided_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      input.id,
      input.review.id,
      input.review.submission_id,
      input.review.submission_revision_id,
      input.review.track_id,
      input.type,
      input.parentDecisionId ?? null,
      input.reasonCategory ?? null,
      input.producerSummary ?? null,
      input.internalNote ?? null,
      input.attentionAcknowledgement ?? null,
      input.snapshot,
      input.actor.id,
    ],
  );
}

async function insertChangeRequest(
  client: Queryable,
  input: {
    decisionId: string;
    review: LockedReview;
    actor: CurrentUser;
    summary: string;
    items: ChangeRequestItemInput[];
  },
) {
  const requestId = randomUUID();
  await client.query(
    `INSERT INTO workflow.change_request
       (id,review_decision_id,submission_id,requested_revision_id,producer_summary,created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      requestId,
      input.decisionId,
      input.review.submission_id,
      input.review.submission_revision_id,
      input.summary,
      input.actor.id,
    ],
  );
  for (const [index, item] of input.items.entries()) {
    await client.query(
      `INSERT INTO workflow.change_request_item
         (id,change_request_id,category,instruction,sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), requestId, item.category, item.instruction, index],
    );
  }
}

async function appendDecisionEvents(
  client: Queryable,
  review: LockedReview,
  actorId: string,
  reviewEvent: string,
  submissionEvent: string,
  fromStatus: string,
  toStatus: string,
  decisionId: string,
) {
  await client.query(
    `INSERT INTO workflow.review_event
       (id,review_case_id,actor_user_id,event_type,event_metadata)
     VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(), review.id, actorId, reviewEvent, { decisionId }],
  );
  await client.query(
    `INSERT INTO workflow.submission_event
       (id,submission_id,submission_revision_id,actor_user_id,event_type,from_status,to_status,event_metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      randomUUID(),
      review.submission_id,
      review.submission_revision_id,
      actorId,
      submissionEvent,
      fromStatus,
      toStatus,
      { decisionId },
    ],
  );
}

async function approveLockedReview(
  client: Queryable,
  input: {
    reviewCaseId: string;
    reviewVersion: number;
    acknowledgeAttention: boolean;
    attentionNote?: string;
    actor: CurrentUser;
  },
): Promise<ReviewDecisionResult> {
  const review = await lockReview(client, input.reviewCaseId);
  const existing = await existingPrimaryDecision(client, review.id);
  if (existing) {
    const result = idempotentResult(existing, "approve");
    if (result) return result;
    throw new DecisionRepositoryError("CONFLICT", DECISION_CONFLICT_MESSAGE);
  }
  assertDecisionReady(review, input.reviewVersion);
  const packet = await loadAuthoritativePacket(client, review);
  assertApprovalPacket(packet);
  const attention = packet.checklist.filter(
    (item) => item.status === "attention",
  );
  if (
    attention.length > 0 &&
    (!input.acknowledgeAttention ||
      (input.attentionNote?.trim().length ?? 0) < 10)
  ) {
    throw new DecisionRepositoryError(
      "INCOMPLETE",
      "Acknowledge every attention item and add a meaningful approval note.",
    );
  }

  const decisionId = randomUUID();
  const snapshot = safeSnapshot(packet, input.reviewVersion);
  await insertDecision(client, {
    id: decisionId,
    review,
    type: "approve",
    actor: input.actor,
    snapshot,
    attentionAcknowledgement: input.attentionNote,
  });

  await client.query(
    `UPDATE catalog.track
     SET title=$2, description=$3, row_version=row_version+1
     WHERE id=$1`,
    [review.track_id, field(packet, "title"), field(packet, "description")],
  );
  await client.query(
    `INSERT INTO catalog.track_metadata
       (track_id,bpm,key_tonic,key_mode,time_signature,energy_score,valence,arousal,
        vocal_state,language_code,era,description_caption,under_dialogue,loopable,
        ending_type,metadata_version,updated_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16)
     ON CONFLICT (track_id) DO UPDATE SET
       bpm=EXCLUDED.bpm,key_tonic=EXCLUDED.key_tonic,key_mode=EXCLUDED.key_mode,
       time_signature=EXCLUDED.time_signature,energy_score=EXCLUDED.energy_score,
       valence=EXCLUDED.valence,arousal=EXCLUDED.arousal,vocal_state=EXCLUDED.vocal_state,
       language_code=EXCLUDED.language_code,era=EXCLUDED.era,
       description_caption=EXCLUDED.description_caption,
       under_dialogue=EXCLUDED.under_dialogue,loopable=EXCLUDED.loopable,
       ending_type=EXCLUDED.ending_type,
       metadata_version=catalog.track_metadata.metadata_version+1,
       updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`,
    [
      review.track_id,
      field(packet, "bpm"),
      field(packet, "keyTonic"),
      field(packet, "keyMode"),
      field(packet, "timeSignature"),
      field(packet, "energyScore"),
      field(packet, "valence"),
      field(packet, "arousal"),
      field(packet, "vocalState"),
      field(packet, "languageCode"),
      field(packet, "era"),
      field(packet, "descriptionCaption"),
      triStateBoolean(field(packet, "underDialogue")),
      triStateBoolean(field(packet, "loopable")),
      field(packet, "endingType"),
      input.actor.id,
    ],
  );
  await client.query(
    `UPDATE catalog.track_term_assignment
     SET review_status='rejected',updated_at=now()
     WHERE track_id=$1 AND source_kind='coordinator' AND review_status='accepted'`,
    [review.track_id],
  );
  for (const term of packet.terms) {
    await client.query(
      `INSERT INTO catalog.track_term_assignment
         (id,track_id,term_id,submission_revision_id,source_kind,review_status,assigned_by_user_id)
       VALUES ($1,$2,$3,$4,'coordinator','accepted',$5)
       ON CONFLICT (track_id,term_id,(COALESCE(submission_revision_id,'00000000-0000-0000-0000-000000000000'::uuid)),source_kind)
       DO UPDATE SET review_status='accepted',assigned_by_user_id=EXCLUDED.assigned_by_user_id,updated_at=now()`,
      [
        randomUUID(),
        review.track_id,
        term.termId,
        review.submission_revision_id,
        input.actor.id,
      ],
    );
  }
  await client.query(
    `UPDATE workflow.submission
     SET status='approved',approved_at=now(),row_version=row_version+1
     WHERE id=$1`,
    [review.submission_id],
  );
  await client.query(
    `UPDATE workflow.submission_revision SET revision_status='accepted' WHERE id=$1`,
    [review.submission_revision_id],
  );
  await client.query(
    `UPDATE workflow.review_case SET status='decisioned',row_version=row_version+1 WHERE id=$1`,
    [review.id],
  );
  await appendDecisionEvents(
    client,
    review,
    input.actor.id,
    "approved",
    "approved",
    "in_review",
    "approved",
    decisionId,
  );
  return {
    decisionId,
    decisionType: "approve",
    submissionId: review.submission_id,
    trackId: review.track_id,
    idempotent: false,
  };
}

export async function approveReview(
  pool: Pool,
  input: Parameters<typeof approveLockedReview>[1],
) {
  assertPermission(input.actor, "submission.approve");
  return withTransaction(pool, (client) => approveLockedReview(client, input));
}

async function primaryNonApproval(
  pool: Pool,
  input: {
    reviewCaseId: string;
    reviewVersion: number;
    type: "request_changes" | "recommend_reject";
    actor: CurrentUser;
    producerSummary?: string;
    reasonCategory?: string;
    internalNote?: string;
    items?: ChangeRequestItemInput[];
  },
): Promise<ReviewDecisionResult> {
  return withTransaction(pool, async (client) => {
    const review = await lockReview(client, input.reviewCaseId);
    const existing = await existingPrimaryDecision(client, review.id);
    if (existing) {
      const result = idempotentResult(existing, input.type);
      if (result) return result;
      throw new DecisionRepositoryError("CONFLICT", DECISION_CONFLICT_MESSAGE);
    }
    assertDecisionReady(review, input.reviewVersion);
    const packet = await loadAuthoritativePacket(client, review);
    const decisionId = randomUUID();
    await insertDecision(client, {
      id: decisionId,
      review,
      type: input.type,
      actor: input.actor,
      snapshot: safeSnapshot(packet, input.reviewVersion),
      producerSummary: input.producerSummary,
      reasonCategory: input.reasonCategory,
      internalNote: input.internalNote,
    });
    if (input.type === "request_changes") {
      await insertChangeRequest(client, {
        decisionId,
        review,
        actor: input.actor,
        summary: input.producerSummary!,
        items: input.items!,
      });
    }
    const nextStatus =
      input.type === "request_changes"
        ? "changes_requested"
        : "rejection_recommended";
    await client.query(
      `UPDATE workflow.submission SET status=$2,row_version=row_version+1 WHERE id=$1`,
      [review.submission_id, nextStatus],
    );
    await client.query(
      `UPDATE workflow.review_case SET status='decisioned',row_version=row_version+1 WHERE id=$1`,
      [review.id],
    );
    await appendDecisionEvents(
      client,
      review,
      input.actor.id,
      input.type === "request_changes"
        ? "changes_requested"
        : "rejection_recommended",
      input.type === "request_changes"
        ? "changes_requested"
        : "rejection_recommended",
      "in_review",
      nextStatus,
      decisionId,
    );
    return {
      decisionId,
      decisionType: input.type,
      submissionId: review.submission_id,
      trackId: review.track_id,
      idempotent: false,
    };
  });
}

export function requestReviewChanges(
  pool: Pool,
  input: {
    reviewCaseId: string;
    reviewVersion: number;
    actor: CurrentUser;
    producerSummary: string;
    items: ChangeRequestItemInput[];
  },
) {
  assertPermission(input.actor, "submission.requestChanges");
  return primaryNonApproval(pool, { ...input, type: "request_changes" });
}

export function recommendReviewRejection(
  pool: Pool,
  input: {
    reviewCaseId: string;
    reviewVersion: number;
    actor: CurrentUser;
    reasonCategory: string;
    internalReason: string;
  },
) {
  assertPermission(input.actor, "submission.recommendReject");
  return primaryNonApproval(pool, {
    ...input,
    type: "recommend_reject",
    internalNote: input.internalReason,
  });
}

interface RecommendationRow extends LockedReview {
  recommendation_id: string;
  packet: DecisionSnapshot;
  resolution_id: string | null;
  resolution_type: ReviewDecisionResult["decisionType"] | null;
}

async function lockRecommendation(
  client: Queryable,
  recommendationId: string,
): Promise<RecommendationRow> {
  const result = await client.query<RecommendationRow>(
    `SELECT review.id,review.submission_id,review.submission_revision_id,review.track_id,
            review.status AS review_status,review.row_version,
            submission.status AS submission_status,submission.current_revision_id,
            revision.revision_status, recommendation.id AS recommendation_id,
            recommendation.decision_packet AS packet,
            resolution.id AS resolution_id,resolution.decision_type AS resolution_type
     FROM workflow.review_decision recommendation
     JOIN workflow.review_case review ON review.id=recommendation.review_case_id
     JOIN workflow.submission submission ON submission.id=review.submission_id
     JOIN workflow.submission_revision revision ON revision.id=review.submission_revision_id
     LEFT JOIN workflow.review_decision resolution ON resolution.parent_decision_id=recommendation.id
     WHERE recommendation.id=$1 AND recommendation.decision_type='recommend_reject'
     FOR UPDATE OF review,submission,revision`,
    [recommendationId],
  );
  const row = result.rows[0];
  if (!row)
    throw new DecisionRepositoryError(
      "NOT_FOUND",
      "Rejection recommendation was not found.",
    );
  return row;
}

async function resolveRecommendation(
  pool: Pool,
  input: {
    recommendationId: string;
    type: "confirm_reject" | "return_for_changes";
    actor: CurrentUser;
    producerSummary: string;
    adminNote?: string;
    items?: ChangeRequestItemInput[];
  },
) {
  assertPermission(input.actor, "submission.confirmReject");
  return withTransaction(pool, async (client) => {
    const review = await lockRecommendation(client, input.recommendationId);
    if (review.resolution_id) {
      if (review.resolution_type === input.type) {
        return {
          decisionId: review.resolution_id,
          decisionType: input.type,
          submissionId: review.submission_id,
          trackId: review.track_id,
          idempotent: true,
        } satisfies ReviewDecisionResult;
      }
      throw new DecisionRepositoryError("CONFLICT", DECISION_CONFLICT_MESSAGE);
    }
    if (
      review.submission_status !== "rejection_recommended" ||
      review.current_revision_id !== review.submission_revision_id
    ) {
      throw new DecisionRepositoryError("CONFLICT", DECISION_CONFLICT_MESSAGE);
    }
    const decisionId = randomUUID();
    await insertDecision(client, {
      id: decisionId,
      review,
      type: input.type,
      parentDecisionId: input.recommendationId,
      actor: input.actor,
      snapshot: review.packet,
      producerSummary: input.producerSummary,
      internalNote: input.adminNote,
    });
    const nextStatus =
      input.type === "confirm_reject" ? "rejected" : "changes_requested";
    if (input.type === "return_for_changes") {
      await insertChangeRequest(client, {
        decisionId,
        review,
        actor: input.actor,
        summary: input.producerSummary,
        items: input.items!,
      });
    }
    await client.query(
      `UPDATE workflow.submission
       SET status=$2,rejected_at=CASE WHEN $2='rejected' THEN now() ELSE rejected_at END,
           row_version=row_version+1 WHERE id=$1`,
      [review.submission_id, nextStatus],
    );
    if (input.type === "confirm_reject") {
      await client.query(
        `UPDATE workflow.submission_revision SET revision_status='rejected' WHERE id=$1`,
        [review.submission_revision_id],
      );
    }
    await appendDecisionEvents(
      client,
      review,
      input.actor.id,
      input.type === "confirm_reject"
        ? "rejection_confirmed"
        : "returned_for_changes",
      input.type === "confirm_reject" ? "rejected" : "changes_requested",
      "rejection_recommended",
      nextStatus,
      decisionId,
    );
    return {
      decisionId,
      decisionType: input.type,
      submissionId: review.submission_id,
      trackId: review.track_id,
      idempotent: false,
    } satisfies ReviewDecisionResult;
  });
}

export function confirmReviewRejection(
  pool: Pool,
  input: {
    recommendationId: string;
    actor: CurrentUser;
    producerReason: string;
    adminNote?: string;
  },
) {
  return resolveRecommendation(pool, {
    ...input,
    type: "confirm_reject",
    producerSummary: input.producerReason,
  });
}

export function returnRejectedReviewForChanges(
  pool: Pool,
  input: {
    recommendationId: string;
    actor: CurrentUser;
    producerSummary: string;
    adminNote?: string;
    items: ChangeRequestItemInput[];
  },
) {
  return resolveRecommendation(pool, {
    ...input,
    type: "return_for_changes",
  });
}

async function loadPublicationInput(
  client: Queryable,
  submissionId: string,
  lock: boolean,
) {
  const result = await client.query<
    {
      submission_id: string;
      submission_status: string;
      revision_id: string;
      revision_status: string;
      track_id: string;
      title: string | null;
      publication_status:
        "unpublished" | "published" | "withdrawn" | "archived";
      vocal_state: string | null;
      rights: PublicationGateInput["rights"];
      copyright: PublicationGateInput["copyright"];
      terms: PublicationGateInput["acceptedTerms"];
      approval_id: string | null;
    } & QueryResultRow
  >(
    `SELECT submission.id AS submission_id,submission.status AS submission_status,
            revision.id AS revision_id,revision.revision_status,
            track.id AS track_id,track.title,track.publication_status,
            metadata.vocal_state,
            CASE WHEN rights.id IS NULL THEN NULL ELSE jsonb_build_object(
              'masterRightsBasis',rights.master_rights_basis,
              'compositionRightsBasis',rights.composition_rights_basis,
              'validUntil',rights.valid_until) END AS rights,
            CASE WHEN copyright.id IS NULL THEN NULL ELSE jsonb_build_object(
              'status',copyright.status,'outcome',copyright.outcome) END AS copyright,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('category',term.category,'label',term.label)
                                      ORDER BY term.category,term.label)
              FROM catalog.track_term_assignment assignment
              JOIN catalog.taxonomy_term term ON term.id=assignment.term_id AND term.is_active=true
              WHERE assignment.track_id=track.id AND assignment.source_kind='coordinator'
                AND assignment.review_status='accepted'), '[]'::jsonb) AS terms,
            (SELECT decision.id FROM workflow.review_decision decision
             WHERE decision.submission_id=submission.id AND decision.submission_revision_id=revision.id
               AND decision.decision_type='approve' LIMIT 1) AS approval_id
     FROM workflow.submission submission
     JOIN workflow.submission_revision revision ON revision.id=submission.current_revision_id
     JOIN catalog.track track ON track.id=submission.track_id
     LEFT JOIN catalog.track_metadata metadata ON metadata.track_id=track.id
     LEFT JOIN rights.rights_declaration rights ON rights.submission_revision_id=revision.id
     LEFT JOIN rights.copyright_check copyright
       ON copyright.submission_revision_id=revision.id AND copyright.is_current=true
     WHERE submission.id=$1
     ${lock ? "FOR UPDATE OF submission,revision,track" : ""}`,
    [submissionId],
  );
  const row = result.rows[0];
  if (!row)
    throw new DecisionRepositoryError("NOT_FOUND", "Submission was not found.");
  const gate = evaluatePublicationGate({
    canonicalTitle: row.title,
    vocalState: row.vocal_state,
    acceptedTerms: row.terms,
    rights: row.rights,
    copyright: row.copyright,
  });
  return { row, gate };
}

async function publishLocked(
  client: Queryable,
  input: { submissionId: string; actor: CurrentUser; reason?: string },
): Promise<{ trackId: string; idempotent: boolean }> {
  const { row, gate } = await loadPublicationInput(
    client,
    input.submissionId,
    true,
  );
  if (row.publication_status === "published") {
    return { trackId: row.track_id, idempotent: true };
  }
  if (
    row.submission_status !== "approved" ||
    row.revision_status !== "accepted" ||
    !row.approval_id ||
    !["unpublished", "withdrawn"].includes(row.publication_status)
  ) {
    throw new DecisionRepositoryError(
      "CONFLICT",
      "Only an approved, accepted and unpublished Track can be published.",
    );
  }
  const republishing = row.publication_status === "withdrawn";
  if (republishing) {
    assertPermission(input.actor, "submission.unpublish");
    if (!input.reason?.trim()) {
      throw new DecisionRepositoryError(
        "INCOMPLETE",
        "A reason is required to republish a withdrawn Track.",
      );
    }
  }
  if (!gate.allowed) {
    throw new DecisionRepositoryError(
      "PUBLICATION_BLOCKED",
      "Publication requirements are not complete.",
      gate.blockers,
    );
  }
  await client.query(
    `UPDATE catalog.track
     SET publication_status='published',published_revision_id=$2,
         published_by_user_id=$3,published_at=now(),withdrawn_at=NULL,
         row_version=row_version+1 WHERE id=$1`,
    [row.track_id, row.revision_id, input.actor.id],
  );
  const eventType = republishing ? "republished" : "published";
  await client.query(
    `INSERT INTO catalog.track_publication_event
       (id,track_id,submission_id,submission_revision_id,event_type,reason,gate_snapshot,actor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      randomUUID(),
      row.track_id,
      row.submission_id,
      row.revision_id,
      eventType,
      republishing ? input.reason : null,
      gate,
      input.actor.id,
    ],
  );
  await client.query(
    `INSERT INTO workflow.submission_event
       (id,submission_id,submission_revision_id,actor_user_id,event_type,event_metadata)
     VALUES ($1,$2,$3,$4,'published',$5)`,
    [
      randomUUID(),
      row.submission_id,
      row.revision_id,
      input.actor.id,
      { publicationEvent: eventType },
    ],
  );
  return { trackId: row.track_id, idempotent: false };
}

export function publishApprovedTrack(
  pool: Pool,
  input: { submissionId: string; actor: CurrentUser; reason?: string },
) {
  assertPermission(input.actor, "submission.publish");
  return withTransaction(pool, (client) => publishLocked(client, input));
}

export function withdrawPublishedTrack(
  pool: Pool,
  input: { submissionId: string; actor: CurrentUser; reason: string },
) {
  assertPermission(input.actor, "submission.unpublish");
  return withTransaction(pool, async (client) => {
    const { row, gate } = await loadPublicationInput(
      client,
      input.submissionId,
      true,
    );
    if (row.publication_status === "withdrawn") {
      return { trackId: row.track_id, idempotent: true };
    }
    if (row.publication_status !== "published") {
      throw new DecisionRepositoryError(
        "CONFLICT",
        "Only a published Track can be withdrawn.",
      );
    }
    await client.query(
      `UPDATE catalog.track SET publication_status='withdrawn',withdrawn_at=now(),
       row_version=row_version+1 WHERE id=$1`,
      [row.track_id],
    );
    await client.query(
      `INSERT INTO catalog.track_publication_event
         (id,track_id,submission_id,submission_revision_id,event_type,reason,gate_snapshot,actor_user_id)
       VALUES ($1,$2,$3,$4,'withdrawn',$5,$6,$7)`,
      [
        randomUUID(),
        row.track_id,
        row.submission_id,
        row.revision_id,
        input.reason,
        gate,
        input.actor.id,
      ],
    );
    await client.query(
      `INSERT INTO workflow.submission_event
         (id,submission_id,submission_revision_id,actor_user_id,event_type,reason)
       VALUES ($1,$2,$3,$4,'unpublished',$5)`,
      [
        randomUUID(),
        row.submission_id,
        row.revision_id,
        input.actor.id,
        input.reason,
      ],
    );
    return { trackId: row.track_id, idempotent: false };
  });
}

export async function bulkApproveReviews(
  pool: Pool,
  input: {
    items: Array<{ id: string; version: number }>;
    actor: CurrentUser;
  },
) {
  assertPermission(input.actor, "submission.bulkApprove");
  if (input.items.length < 1 || input.items.length > 25)
    throw new DecisionRepositoryError("INCOMPLETE", "Select 1 to 25 reviews.");
  const items = [...input.items].sort((a, b) => a.id.localeCompare(b.id));
  return withTransaction(pool, async (client) => {
    const results: ReviewDecisionResult[] = [];
    for (const item of items) {
      const review = await lockReview(client, item.id);
      const packet = await loadAuthoritativePacket(client, review);
      if (packet.checklist.some((check) => check.status === "attention")) {
        throw new DecisionRepositoryError(
          "INCOMPLETE",
          "Bulk approval only accepts clean reviews with no attention items.",
        );
      }
      results.push(
        await approveLockedReview(client, {
          reviewCaseId: item.id,
          reviewVersion: item.version,
          acknowledgeAttention: false,
          actor: input.actor,
        }),
      );
    }
    return results;
  });
}

export async function bulkPublishTracks(
  pool: Pool,
  input: { submissionIds: string[]; actor: CurrentUser },
) {
  assertPermission(input.actor, "submission.publish");
  if (input.submissionIds.length < 1 || input.submissionIds.length > 25)
    throw new DecisionRepositoryError(
      "INCOMPLETE",
      "Select 1 to 25 approved Tracks.",
    );
  const ids = [...input.submissionIds].sort();
  return withTransaction(pool, async (client) => {
    const results = [];
    for (const submissionId of ids) {
      const { row } = await loadPublicationInput(client, submissionId, true);
      if (row.publication_status !== "unpublished") {
        throw new DecisionRepositoryError(
          "CONFLICT",
          "Bulk Publish only accepts approved, unpublished Tracks.",
        );
      }
      results.push(
        await publishLocked(client, { submissionId, actor: input.actor }),
      );
    }
    return results;
  });
}

export async function listApprovedForPublication(
  database: Queryable,
): Promise<ApprovedPublicationItem[]> {
  const result = await database.query<
    {
      submission_id: string;
      revision_id: string;
      track_id: string;
      title: string;
      producer_name: string;
      publication_status: "unpublished" | "withdrawn";
    } & QueryResultRow
  >(
    `SELECT submission.id AS submission_id,submission.current_revision_id AS revision_id,
            submission.track_id,COALESCE(track.title,'Untitled track') AS title,
            owner.name AS producer_name,track.publication_status
     FROM workflow.submission submission
     JOIN catalog.track track ON track.id=submission.track_id
     JOIN auth."user" owner ON owner.id=submission.owner_user_id
     WHERE submission.status='approved'
       AND track.publication_status IN ('unpublished','withdrawn')
     ORDER BY submission.approved_at,submission.id
     LIMIT 100`,
  );
  const items: ApprovedPublicationItem[] = [];
  for (const row of result.rows) {
    const { gate } = await loadPublicationInput(
      database,
      row.submission_id,
      false,
    );
    items.push({
      submissionId: row.submission_id,
      revisionId: row.revision_id,
      trackId: row.track_id,
      title: row.title,
      producerName: row.producer_name,
      publicationStatus: row.publication_status,
      gate,
    });
  }
  return items;
}

export async function loadSubmissionDecisionSummary(
  database: Queryable,
  submissionId: string,
  includeInternal: boolean,
): Promise<SubmissionDecisionSummary | null> {
  const subject = await database.query<
    {
      publication_status: SubmissionDecisionSummary["publicationStatus"];
      status: string;
    } & QueryResultRow
  >(
    `SELECT track.publication_status,submission.status
     FROM workflow.submission submission
     JOIN catalog.track track ON track.id=submission.track_id
     WHERE submission.id=$1`,
    [submissionId],
  );
  if (!subject.rows[0]) return null;
  const [decisions, request, items, history] = await Promise.all([
    database.query<
      {
        id: string;
        decision_type: SubmissionDecisionSummary["decisions"][number]["type"];
        producer_summary: string | null;
        reason_category: string | null;
        internal_note: string | null;
        decided_by_name: string;
        created_at: Date;
      } & QueryResultRow
    >(
      `SELECT decision.id,decision.decision_type,decision.producer_summary,
              decision.reason_category,decision.internal_note,
              actor.name AS decided_by_name,decision.created_at
       FROM workflow.review_decision decision
       JOIN auth."user" actor ON actor.id=decision.decided_by_user_id
       WHERE decision.submission_id=$1 ORDER BY decision.created_at,decision.id`,
      [submissionId],
    ),
    database.query<
      {
        id: string;
        status: "open" | "resolved" | "superseded";
        producer_summary: string;
        requested_revision_id: string;
        resolved_by_revision_id: string | null;
        created_at: Date;
      } & QueryResultRow
    >(
      `SELECT id,status,producer_summary,requested_revision_id,resolved_by_revision_id,created_at
       FROM workflow.change_request WHERE submission_id=$1
       ORDER BY created_at DESC,id DESC LIMIT 1`,
      [submissionId],
    ),
    database.query<
      {
        id: string;
        change_request_id: string;
        category: ChangeRequestItemInput["category"];
        instruction: string;
      } & QueryResultRow
    >(
      `SELECT item.id,item.change_request_id,item.category,item.instruction
       FROM workflow.change_request_item item
       JOIN workflow.change_request request ON request.id=item.change_request_id
       WHERE request.submission_id=$1 ORDER BY item.sort_order,item.id`,
      [submissionId],
    ),
    database.query<
      {
        id: string;
        event_type: PublicationEventView["type"];
        reason: string | null;
        actor_name: string;
        created_at: Date;
      } & QueryResultRow
    >(
      `SELECT event.id,event.event_type,event.reason,actor.name AS actor_name,event.created_at
       FROM catalog.track_publication_event event
       JOIN auth."user" actor ON actor.id=event.actor_user_id
       WHERE event.submission_id=$1 ORDER BY event.created_at DESC,event.id DESC`,
      [submissionId],
    ),
  ]);
  const change = request.rows[0];
  let publicationGate: PublicationGateResult | null = null;
  if (subject.rows[0].status === "approved") {
    publicationGate = (
      await loadPublicationInput(database, submissionId, false)
    ).gate;
  }
  return {
    decisions: decisions.rows.map((row) => ({
      id: row.id,
      type: row.decision_type,
      producerSummary: row.producer_summary,
      reasonCategory: includeInternal ? row.reason_category : null,
      internalNote: includeInternal ? row.internal_note : null,
      decidedByName: row.decided_by_name,
      createdAt: row.created_at.toISOString(),
    })),
    changeRequest: change
      ? {
          id: change.id,
          status: change.status,
          producerSummary: change.producer_summary,
          requestedRevisionId: change.requested_revision_id,
          resolvedByRevisionId: change.resolved_by_revision_id,
          createdAt: change.created_at.toISOString(),
          items: items.rows
            .filter((item) => item.change_request_id === change.id)
            .map((item) => ({
              id: item.id,
              category: item.category,
              instruction: item.instruction,
            })),
        }
      : null,
    publicationHistory: history.rows.map((row) => ({
      id: row.id,
      type: row.event_type,
      reason: row.reason,
      actorName: row.actor_name,
      createdAt: row.created_at.toISOString(),
    })),
    publicationStatus: subject.rows[0].publication_status,
    publicationGate,
    reviewPacket: null as ReviewDecisionPacket | null,
  };
}
