import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { CurrentUser } from "@/types/auth";
import type {
  ReviewAggregate,
  ReviewAudioFile,
  ReviewChecklistItem,
  ReviewDecisionPacket,
  ReviewFieldDecision,
  ReviewFieldName,
  ReviewQueueFilters,
  ReviewQueueItem,
  ReviewQueueResult,
  ReviewTaxonomyTerm,
} from "@/types/review";
import { REVIEW_CHECK_CODES } from "@/types/review";

import { canEditReview, canReassignReview } from "./authorization";

type Queryable = Pick<Pool | PoolClient, "query">;

export const REVIEW_CONFLICT_MESSAGE =
  "This review changed in another session. Refresh to continue.";

export class ReviewRepositoryError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "NOT_REVIEWABLE"
      | "ALREADY_ASSIGNED"
      | "READ_ONLY"
      | "CONFLICT"
      | "INCOMPLETE"
      | "INVALID_SOURCE",
    message: string,
  ) {
    super(message);
    this.name = "ReviewRepositoryError";
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

function iso(value: Date | string | null): string | null {
  return value == null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
}

function number(value: string | number | null): number | null {
  return value == null ? null : Number(value);
}

interface QueueRow extends QueryResultRow {
  submission_id: string;
  revision_id: string;
  revision_number: number;
  track_title: string;
  producer_name: string;
  submission_status: "ready_for_review" | "in_review";
  review_case_id: string | null;
  review_status: ReviewQueueItem["reviewStatus"];
  row_version: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  technical_state: ReviewQueueItem["technicalState"];
  ai_state: ReviewQueueItem["aiState"];
  copyright_state: ReviewQueueItem["copyrightState"];
  rights_state: ReviewQueueItem["rightsState"];
  waiting_since: Date;
  total_count: string;
}

const QUEUE_CTE = `
  WITH review_queue AS (
    SELECT submission.id AS submission_id,
           revision.id AS revision_id,
           revision.revision_number,
           COALESCE(NULLIF(track.title, ''), NULLIF(revision.producer_metadata->>'workingTitle', ''), 'Untitled track') AS track_title,
           owner.name AS producer_name,
           submission.status AS submission_status,
           review.id AS review_case_id,
           review.status AS review_status,
           review.row_version,
           review.assigned_to_user_id,
           assignee.name AS assigned_to_name,
           CASE WHEN EXISTS (
             SELECT 1 FROM analysis.qc_issue issue
             WHERE issue.submission_revision_id = revision.id
               AND issue.severity IN ('warning', 'error')
           ) THEN 'warnings' ELSE 'clean' END AS technical_state,
           CASE
             WHEN analysis.ai_status = 'complete' THEN 'complete'
             WHEN analysis.ai_status = 'failed' THEN 'failed'
             WHEN analysis.ai_status IN ('disabled', 'not_started') OR analysis.id IS NULL THEN 'not_configured'
             ELSE 'partial'
           END AS ai_state,
           CASE
             WHEN copyright.outcome = 'no_claim_observed' THEN 'clear'
             WHEN copyright.outcome IN (
               'third_party_claim_observed', 'existing_internal_claim', 'reference_overlap',
               'ownership_conflict', 'copyright_strike_observed', 'inconclusive'
             ) OR copyright.status = 'failed' THEN 'attention'
             ELSE 'pending'
           END AS copyright_state,
           CASE
             WHEN rights.id IS NOT NULL
              AND rights.master_rights_basis <> 'unknown'
              AND rights.composition_rights_basis <> 'unknown'
              AND rights.content_id_eligibility <> 'needs_review'
             THEN 'reviewed' ELSE 'attention'
           END AS rights_state,
           COALESCE(submission.review_started_at, submission.updated_at, submission.created_at) AS waiting_since
    FROM workflow.submission submission
    JOIN workflow.submission_revision revision ON revision.id = submission.current_revision_id
    JOIN catalog.track track ON track.id = submission.track_id
    JOIN auth."user" owner ON owner.id = submission.owner_user_id
    LEFT JOIN workflow.review_case review ON review.submission_revision_id = revision.id
    LEFT JOIN auth."user" assignee ON assignee.id = review.assigned_to_user_id
    LEFT JOIN analysis.revision_analysis analysis ON analysis.submission_revision_id = revision.id
    LEFT JOIN rights.rights_declaration rights ON rights.submission_revision_id = revision.id
    LEFT JOIN rights.copyright_check copyright
      ON copyright.submission_revision_id = revision.id AND copyright.is_current
    WHERE submission.status IN ('ready_for_review', 'in_review')
  )`;

export async function listReviewQueue(
  database: Queryable,
  userId: string,
  filters: ReviewQueueFilters,
  pageSize = 50,
): Promise<ReviewQueueResult> {
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const offset = (filters.page - 1) * safePageSize;
  const result = await database.query<QueueRow>(
    `${QUEUE_CTE}
     SELECT *, count(*) OVER() AS total_count
     FROM review_queue
     WHERE ($2 = 'all' OR ($2 = 'unassigned' AND assigned_to_user_id IS NULL)
                       OR ($2 = 'mine' AND assigned_to_user_id = $1))
       AND ($3 = 'all' OR ($3 = 'ready_for_decision' AND review_status = 'ready_for_decision')
                       OR ($3 <> 'ready_for_decision' AND submission_status = $3 AND COALESCE(review_status, 'in_progress') <> 'ready_for_decision'))
       AND ($4 = 'all' OR technical_state = $4)
       AND ($5 = 'all' OR ai_state = $5)
       AND ($6 = 'all' OR copyright_state = $6)
       AND ($7 = 'all' OR rights_state = $7)
       AND ($8 = '' OR track_title ILIKE '%' || $8 || '%' OR producer_name ILIKE '%' || $8 || '%')
     ORDER BY waiting_since ASC, submission_id ASC
     LIMIT $9 OFFSET $10`,
    [
      userId,
      filters.assignment,
      filters.state,
      filters.technical,
      filters.ai,
      filters.copyright,
      filters.rights,
      filters.search,
      safePageSize,
      offset,
    ],
  );
  const countResult = await database.query<
    {
      unassigned: string;
      mine: string;
      in_progress: string;
      ready: string;
      attention: string;
    } & QueryResultRow
  >(
    `${QUEUE_CTE}
     SELECT count(*) FILTER (WHERE assigned_to_user_id IS NULL) AS unassigned,
            count(*) FILTER (WHERE assigned_to_user_id = $1) AS mine,
            count(*) FILTER (WHERE review_status = 'in_progress') AS in_progress,
            count(*) FILTER (WHERE review_status = 'ready_for_decision') AS ready,
            count(*) FILTER (WHERE technical_state = 'warnings' OR copyright_state = 'attention' OR rights_state = 'attention') AS attention
     FROM review_queue`,
    [userId],
  );
  const counts = countResult.rows[0]!;
  return {
    items: result.rows.map((row) => ({
      submissionId: row.submission_id,
      revisionId: row.revision_id,
      revisionNumber: row.revision_number,
      trackTitle: row.track_title,
      producerName: row.producer_name,
      submissionStatus: row.submission_status,
      reviewCaseId: row.review_case_id,
      reviewStatus: row.review_status,
      rowVersion: number(row.row_version),
      assignedToUserId: row.assigned_to_user_id,
      assignedToName: row.assigned_to_name,
      technicalState: row.technical_state,
      aiState: row.ai_state,
      copyrightState: row.copyright_state,
      rightsState: row.rights_state,
      waitingSince: iso(row.waiting_since)!,
    })),
    total: Number(result.rows[0]?.total_count ?? 0),
    page: filters.page,
    pageSize: safePageSize,
    counts: {
      unassigned: Number(counts.unassigned),
      mine: Number(counts.mine),
      inProgress: Number(counts.in_progress),
      readyForDecision: Number(counts.ready),
      needsAttention: Number(counts.attention),
    },
  };
}

interface BaseRow extends QueryResultRow {
  submission_id: string;
  revision_id: string;
  revision_number: number;
  track_id: string;
  track_title: string;
  asset_kind: ReviewAggregate["assetKind"];
  producer_name: string;
  submission_status: "ready_for_review" | "in_review";
  producer_metadata: Record<string, unknown>;
  embedded_metadata: Record<string, unknown>;
  review_case_id: string | null;
  review_status: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  row_version: string | null;
  ready_for_decision_at: Date | null;
  fields: Record<string, ReviewFieldDecision> | null;
  ai_status: string | null;
}

export async function loadReviewAggregate(
  database: Queryable,
  submissionId: string,
  viewer: CurrentUser,
): Promise<ReviewAggregate | null> {
  const baseResult = await database.query<BaseRow>(
    `SELECT submission.id AS submission_id, revision.id AS revision_id,
            revision.revision_number, submission.track_id,
            COALESCE(NULLIF(track.title, ''), NULLIF(revision.producer_metadata->>'workingTitle', ''), 'Untitled track') AS track_title,
            track.asset_kind, owner.name AS producer_name,
            submission.status AS submission_status,
            revision.producer_metadata, revision.embedded_metadata,
            review.id AS review_case_id, review.status AS review_status,
            review.assigned_to_user_id, assignee.name AS assigned_to_name,
            review.row_version, review.ready_for_decision_at,
            draft.fields, analysis.ai_status
     FROM workflow.submission submission
     JOIN workflow.submission_revision revision ON revision.id = submission.current_revision_id
     JOIN catalog.track track ON track.id = submission.track_id
     JOIN auth."user" owner ON owner.id = submission.owner_user_id
     LEFT JOIN workflow.review_case review ON review.submission_revision_id = revision.id
     LEFT JOIN workflow.review_metadata_draft draft ON draft.review_case_id = review.id
     LEFT JOIN auth."user" assignee ON assignee.id = review.assigned_to_user_id
     LEFT JOIN analysis.revision_analysis analysis ON analysis.submission_revision_id = revision.id
     WHERE submission.id = $1 AND submission.status IN ('ready_for_review', 'in_review')`,
    [submissionId],
  );
  const base = baseResult.rows[0];
  if (!base) return null;

  const [
    audio,
    issues,
    suggestions,
    taxonomy,
    checklist,
    notes,
    rights,
    copyright,
    reviewers,
  ] = await Promise.all([
    database.query<
      {
        id: string;
        asset_role: "master" | "stem";
        label: string;
        content_type: string;
        container_format: string | null;
        codec: string | null;
        byte_size: string;
        duration_ms: string | null;
        sample_rate_hz: number | null;
        bit_depth: number | null;
        channels: number | null;
        channel_layout: string | null;
        bit_rate_bps: string | null;
        integrated_loudness_lufs: string | null;
        loudness_range_lu: string | null;
        true_peak_dbtp: string | null;
        leading_silence_ms: string | null;
        trailing_silence_ms: string | null;
      } & QueryResultRow
    >(
      `SELECT file.id, asset.asset_role,
                COALESCE(asset.display_title, asset.stem_label, initcap(replace(asset.stem_type, '_', ' ')), 'Master') AS label,
                file.content_type, technical.container_format, technical.codec,
                file.byte_size, technical.duration_ms, technical.sample_rate_hz,
                technical.bit_depth, technical.channels, technical.channel_layout,
                technical.bit_rate_bps, technical.integrated_loudness_lufs,
                technical.loudness_range_lu, technical.true_peak_dbtp,
                technical.leading_silence_ms, technical.trailing_silence_ms
         FROM catalog.audio_asset asset
         JOIN catalog.audio_file file ON file.audio_asset_id = asset.id
           AND file.file_role = 'source' AND file.technical_status = 'available'
         LEFT JOIN analysis.file_technical_result technical ON technical.audio_file_id = file.id
         WHERE asset.submission_revision_id = $1
         ORDER BY asset.sort_order, asset.created_at, file.id`,
      [base.revision_id],
    ),
    database.query<
      {
        id: string;
        audio_file_id: string | null;
        severity: "error" | "warning" | "info";
        code: string;
        message: string;
      } & QueryResultRow
    >(
      `SELECT id, audio_file_id, severity, code, message FROM analysis.qc_issue
         WHERE submission_revision_id = $1 ORDER BY CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at, id`,
      [base.revision_id],
    ),
    database.query<{ field_name: string; value: unknown } & QueryResultRow>(
      `SELECT field_name, value FROM analysis.metadata_suggestion
         WHERE submission_revision_id = $1 ORDER BY created_at, id`,
      [base.revision_id],
    ),
    database.query<
      {
        id: string;
        category: ReviewTaxonomyTerm["category"];
        label: string;
        source_kind: ReviewTaxonomyTerm["sourceKind"];
        source_assignment_id: string | null;
        confidence: string | null;
        decision: ReviewTaxonomyTerm["decision"];
      } & QueryResultRow
    >(
      `SELECT term.id, term.category, term.label,
                assignment.source_kind, assignment.id AS source_assignment_id,
                assignment.confidence, selection.decision
         FROM catalog.taxonomy_term term
         LEFT JOIN LATERAL (
           SELECT candidate.* FROM catalog.track_term_assignment candidate
           WHERE candidate.term_id = term.id AND candidate.track_id = $2
             AND (candidate.submission_revision_id = $1 OR candidate.submission_revision_id IS NULL)
           ORDER BY (candidate.submission_revision_id = $1) DESC,
                    CASE candidate.source_kind WHEN 'producer' THEN 1 WHEN 'embedded' THEN 2 WHEN 'ai' THEN 3 ELSE 4 END,
                    candidate.created_at DESC, candidate.id
           LIMIT 1
         ) assignment ON true
         LEFT JOIN workflow.review_term_selection selection
           ON selection.term_id = term.id AND selection.review_case_id = $3
         WHERE term.is_active = true
         ORDER BY term.category, term.label, term.id`,
      [base.revision_id, base.track_id, base.review_case_id],
    ),
    database.query<
      {
        code: ReviewChecklistItem["code"];
        status: ReviewChecklistItem["status"];
        note: string | null;
        reviewed_at: Date | null;
      } & QueryResultRow
    >(
      `SELECT code, status, note, reviewed_at FROM workflow.review_check_item
         WHERE review_case_id = $1 ORDER BY code`,
      [base.review_case_id],
    ),
    database.query<
      {
        id: string;
        category: ReviewAggregate["notes"][number]["category"];
        body: string;
        author_name: string;
        created_at: Date;
      } & QueryResultRow
    >(
      `SELECT note.id, note.category, note.body, author.name AS author_name, note.created_at
         FROM workflow.review_note note JOIN auth."user" author ON author.id = note.created_by_user_id
         WHERE note.review_case_id = $1 ORDER BY note.created_at DESC, note.id DESC`,
      [base.review_case_id],
    ),
    database.query<Record<string, unknown> & QueryResultRow>(
      `SELECT master_rights_basis AS "masterRightsBasis", master_owner_name AS "masterOwnerName",
                composition_rights_basis AS "compositionRightsBasis", composition_owner_name AS "compositionOwnerName",
                publisher_name AS "publisherName", territory, valid_from AS "validFrom", valid_until AS "validUntil",
                one_stop_clearance AS "oneStopClearance", content_id_eligibility AS "contentIdEligibility", notes
         FROM rights.rights_declaration WHERE submission_revision_id = $1`,
      [base.revision_id],
    ),
    database.query<Record<string, unknown> & QueryResultRow>(
      `SELECT copyright.status, copyright.outcome,
                copyright.eligibility_status AS "eligibilityStatus",
                copyright.readiness_status AS "readinessStatus",
                observation.observation_type AS "observationType",
                observation.claimant_name AS "claimantName",
                observation.claim_status AS "claimStatus",
                observation.claim_policy AS "claimPolicy",
                observation.youtube_claim_id AS "claimId",
                COALESCE(observation.youtube_asset_id, reference.youtube_asset_id) AS "assetId",
                COALESCE(observation.youtube_reference_id, reference.youtube_reference_id) AS "referenceId",
                observer.name AS "observedBy", observation.observed_at AS "observedAt",
                copyright.updated_at AS "updatedAt"
         FROM rights.copyright_check copyright
         LEFT JOIN LATERAL (
           SELECT candidate.* FROM rights.copyright_observation candidate
           WHERE candidate.copyright_check_id=copyright.id
             AND NOT EXISTS (
               SELECT 1 FROM rights.copyright_observation successor
               WHERE successor.supersedes_observation_id=candidate.id
             )
           ORDER BY candidate.observed_at DESC, candidate.id DESC LIMIT 1
         ) observation ON true
         LEFT JOIN auth."user" observer ON observer.id=observation.observed_by_user_id
         LEFT JOIN LATERAL (
           SELECT link.youtube_asset_id, link.youtube_reference_id
           FROM rights.youtube_reference_link link
           WHERE link.copyright_check_id=copyright.id
           ORDER BY link.recorded_at DESC LIMIT 1
         ) reference ON true
         WHERE copyright.submission_revision_id = $1 AND copyright.is_current`,
      [base.revision_id],
    ),
    database.query<
      {
        id: string;
        name: string;
        role: "admin" | "coordinator";
      } & QueryResultRow
    >(
      `SELECT access.auth_user_id AS id, COALESCE(access.display_name, member.name) AS name, access.role
         FROM auth.team_access access JOIN auth."user" member ON member.id = access.auth_user_id
         WHERE access.status = 'active' AND access.role IN ('admin', 'coordinator')
         ORDER BY access.role, name, id`,
    ),
  ]);

  const ai = Object.fromEntries(
    suggestions.rows.map((row) => [row.field_name, row.value]),
  );
  const audioFiles: ReviewAudioFile[] = audio.rows.map((row) => ({
    id: row.id,
    assetRole: row.asset_role,
    label: row.asset_role === "master" ? "Master" : row.label,
    contentType: row.content_type,
    containerFormat: row.container_format,
    codec: row.codec,
    byteSize: Number(row.byte_size),
    durationMs: number(row.duration_ms),
    sampleRateHz: row.sample_rate_hz,
    bitDepth: row.bit_depth,
    channels: row.channels,
    channelLayout: row.channel_layout,
    bitRateBps: number(row.bit_rate_bps),
    integratedLoudnessLufs: number(row.integrated_loudness_lufs),
    loudnessRangeLu: number(row.loudness_range_lu),
    truePeakDbtp: number(row.true_peak_dbtp),
    leadingSilenceMs: number(row.leading_silence_ms),
    trailingSilenceMs: number(row.trailing_silence_ms),
  }));
  const reviewCase = base.review_case_id
    ? {
        id: base.review_case_id,
        status: base.review_status as
          "in_progress" | "ready_for_decision" | "decisioned" | "superseded",
        assignedToUserId: base.assigned_to_user_id,
        assignedToName: base.assigned_to_name,
        rowVersion: Number(base.row_version),
        readyForDecisionAt: iso(base.ready_for_decision_at),
      }
    : null;
  return {
    submissionId: base.submission_id,
    revisionId: base.revision_id,
    revisionNumber: base.revision_number,
    trackId: base.track_id,
    trackTitle: base.track_title,
    assetKind: base.asset_kind,
    producerName: base.producer_name,
    submissionStatus: base.submission_status,
    reviewCase,
    editable: Boolean(reviewCase) && canEditReview(viewer, reviewCase!),
    sources: {
      producer: base.producer_metadata ?? {},
      embedded: base.embedded_metadata ?? {},
      ai,
    },
    draft: base.fields ?? {},
    audioFiles,
    qcIssues: issues.rows.map((row) => ({
      id: row.id,
      audioFileId: row.audio_file_id,
      severity: row.severity,
      code: row.code,
      message: row.message,
    })),
    taxonomyTerms: taxonomy.rows.map((row) => ({
      id: row.id,
      category: row.category,
      label: row.label,
      sourceKind: row.source_kind,
      sourceAssignmentId: row.source_assignment_id,
      confidence: number(row.confidence),
      decision: row.decision,
    })),
    checklist: checklist.rows.map((row) => ({
      code: row.code,
      status: row.status,
      note: row.note,
      reviewedAt: iso(row.reviewed_at),
    })),
    notes: notes.rows.map((row) => ({
      id: row.id,
      category: row.category,
      body: row.body,
      authorName: row.author_name,
      createdAt: iso(row.created_at)!,
    })),
    rights: rights.rows[0] ?? null,
    copyright: copyright.rows[0] ?? null,
    aiStatus: base.ai_status ?? "not_started",
    eligibleReviewers: reviewers.rows,
  };
}

async function initializeReviewCase(
  client: Queryable,
  caseId: string,
  revisionId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO workflow.review_metadata_draft (review_case_id) VALUES ($1)
     ON CONFLICT (review_case_id) DO NOTHING`,
    [caseId],
  );
  const stemCount = await client.query<{ count: string } & QueryResultRow>(
    `SELECT count(*) FROM catalog.audio_asset
     WHERE submission_revision_id = $1 AND asset_role = 'stem'`,
    [revisionId],
  );
  for (const code of REVIEW_CHECK_CODES) {
    const status =
      code === "stems" && Number(stemCount.rows[0]?.count) === 0
        ? "not_applicable"
        : "pending";
    await client.query(
      `INSERT INTO workflow.review_check_item (id, review_case_id, code, status)
       VALUES ($1, $2, $3, $4) ON CONFLICT (review_case_id, code) DO NOTHING`,
      [randomUUID(), caseId, code, status],
    );
  }
}

export async function ensureLegacyReviewCase(
  pool: Pool,
  submissionId: string,
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const subject = await client.query<
      { revision_id: string; track_id: string } & QueryResultRow
    >(
      `SELECT current_revision_id AS revision_id, track_id
       FROM workflow.submission WHERE id = $1 AND status = 'in_review' FOR UPDATE`,
      [submissionId],
    );
    const row = subject.rows[0];
    if (!row?.revision_id) return;
    const caseId = randomUUID();
    const inserted = await client.query<{ id: string } & QueryResultRow>(
      `INSERT INTO workflow.review_case
         (id, submission_id, submission_revision_id, track_id, started_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (submission_revision_id) DO NOTHING RETURNING id`,
      [caseId, submissionId, row.revision_id, row.track_id],
    );
    const id = inserted.rows[0]?.id;
    if (!id) return;
    await initializeReviewCase(client, id, row.revision_id);
    await client.query(
      `INSERT INTO workflow.review_event (id, review_case_id, event_type, event_metadata)
       VALUES ($1, $2, 'case_created', '{"reconciled":true}'::jsonb)`,
      [randomUUID(), id],
    );
  });
}

export async function startOrClaimReview(
  pool: Pool,
  submissionId: string,
  actorUserId: string,
): Promise<string> {
  return withTransaction(pool, async (client) => {
    const subject = await client.query<
      { status: string; revision_id: string; track_id: string } & QueryResultRow
    >(
      `SELECT status, current_revision_id AS revision_id, track_id
       FROM workflow.submission WHERE id = $1 FOR UPDATE`,
      [submissionId],
    );
    const row = subject.rows[0];
    if (!row?.revision_id)
      throw new ReviewRepositoryError("NOT_FOUND", "Submission was not found.");
    if (!["ready_for_review", "in_review"].includes(row.status))
      throw new ReviewRepositoryError(
        "NOT_REVIEWABLE",
        "Submission is no longer reviewable.",
      );

    const created = await client.query<{ id: string } & QueryResultRow>(
      `INSERT INTO workflow.review_case
         (id, submission_id, submission_revision_id, track_id, started_by_user_id, started_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (submission_revision_id) DO NOTHING RETURNING id`,
      [randomUUID(), submissionId, row.revision_id, row.track_id, actorUserId],
    );
    const review = await client.query<
      {
        id: string;
        assigned_to_user_id: string | null;
        status: string;
      } & QueryResultRow
    >(
      `SELECT id, assigned_to_user_id, status FROM workflow.review_case
       WHERE submission_revision_id = $1 FOR UPDATE`,
      [row.revision_id],
    );
    const reviewRow = review.rows[0]!;
    if (created.rows[0]) {
      await event(client, reviewRow.id, actorUserId, "case_created", {
        submissionRevisionId: row.revision_id,
      });
    }
    if (reviewRow.status !== "in_progress")
      throw new ReviewRepositoryError(
        "READ_ONLY",
        "This review is already ready for decision.",
      );
    if (
      reviewRow.assigned_to_user_id &&
      reviewRow.assigned_to_user_id !== actorUserId
    )
      throw new ReviewRepositoryError(
        "ALREADY_ASSIGNED",
        "Another reviewer already claimed this review.",
      );

    await initializeReviewCase(client, reviewRow.id, row.revision_id);
    if (!reviewRow.assigned_to_user_id) {
      await client.query(
        `UPDATE workflow.review_case SET assigned_to_user_id = $2,
         started_by_user_id = COALESCE(started_by_user_id, $2), started_at = COALESCE(started_at, now()),
         row_version = row_version + 1 WHERE id = $1`,
        [reviewRow.id, actorUserId],
      );
      await client.query(
        `INSERT INTO workflow.review_event (id, review_case_id, actor_user_id, event_type)
         VALUES ($1, $2, $3, 'claimed')`,
        [randomUUID(), reviewRow.id, actorUserId],
      );
    }
    if (row.status === "ready_for_review") {
      await client.query(
        `UPDATE workflow.submission SET status = 'in_review', review_started_at = now(),
         row_version = row_version + 1 WHERE id = $1`,
        [submissionId],
      );
      await client.query(
        `INSERT INTO workflow.submission_event
           (id, submission_id, submission_revision_id, actor_user_id, event_type, from_status, to_status)
         VALUES ($1, $2, $3, $4, 'review_started', 'ready_for_review', 'in_review')`,
        [randomUUID(), submissionId, row.revision_id, actorUserId],
      );
    }
    return reviewRow.id;
  });
}

interface LockedCase {
  id: string;
  submission_id: string;
  submission_revision_id: string;
  track_id: string;
  status: string;
  assigned_to_user_id: string | null;
  row_version: string;
  asset_kind: string;
}

async function lockEditableCase(
  client: Queryable,
  reviewCaseId: string,
  expectedVersion: number,
  actor: CurrentUser,
): Promise<LockedCase> {
  const result = await client.query<LockedCase & QueryResultRow>(
    `SELECT review.id, review.submission_id, review.submission_revision_id, review.track_id,
            review.status, review.assigned_to_user_id, review.row_version, track.asset_kind
     FROM workflow.review_case review
     JOIN workflow.submission submission ON submission.id = review.submission_id
     JOIN catalog.track track ON track.id = review.track_id
     WHERE review.id = $1 AND submission.status = 'in_review' FOR UPDATE OF review`,
    [reviewCaseId],
  );
  const row = result.rows[0];
  if (!row)
    throw new ReviewRepositoryError("NOT_FOUND", "Review was not found.");
  if (Number(row.row_version) !== expectedVersion)
    throw new ReviewRepositoryError("CONFLICT", REVIEW_CONFLICT_MESSAGE);
  if (
    !canEditReview(actor, {
      status: row.status as
        "in_progress" | "ready_for_decision" | "decisioned" | "superseded",
      assignedToUserId: row.assigned_to_user_id,
    })
  )
    throw new ReviewRepositoryError(
      "READ_ONLY",
      row.status === "in_progress"
        ? "This review is read-only for you."
        : "Reopen this review before editing it.",
    );
  return row;
}

async function bumpCase(client: Queryable, id: string): Promise<number> {
  const result = await client.query<{ row_version: string } & QueryResultRow>(
    `UPDATE workflow.review_case SET row_version = row_version + 1 WHERE id = $1 RETURNING row_version`,
    [id],
  );
  return Number(result.rows[0]!.row_version);
}

async function event(
  client: Queryable,
  reviewCaseId: string,
  actorUserId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO workflow.review_event
       (id, review_case_id, actor_user_id, event_type, event_metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), reviewCaseId, actorUserId, eventType, metadata],
  );
}

export async function saveMetadataDecision(
  pool: Pool,
  input: {
    reviewCaseId: string;
    fieldName: ReviewFieldName;
    decision: ReviewFieldDecision;
    expectedVersion: number;
    actor: CurrentUser;
  },
): Promise<number> {
  return withTransaction(pool, async (client) => {
    await lockEditableCase(
      client,
      input.reviewCaseId,
      input.expectedVersion,
      input.actor,
    );
    await client.query(
      `UPDATE workflow.review_metadata_draft
       SET fields = jsonb_set(fields, ARRAY[$2], $3::jsonb, true)
       WHERE review_case_id = $1`,
      [input.reviewCaseId, input.fieldName, JSON.stringify(input.decision)],
    );
    const version = await bumpCase(client, input.reviewCaseId);
    await event(
      client,
      input.reviewCaseId,
      input.actor.id,
      "metadata_updated",
      {
        fieldName: input.fieldName,
        sourceKind: input.decision.sourceKind,
      },
    );
    return version;
  });
}

export async function saveTermDecision(
  pool: Pool,
  input: {
    reviewCaseId: string;
    termId: string;
    sourceKind: string;
    decision: "selected" | "rejected";
    reason?: string;
    expectedVersion: number;
    actor: CurrentUser;
  },
): Promise<number> {
  return withTransaction(pool, async (client) => {
    const review = await lockEditableCase(
      client,
      input.reviewCaseId,
      input.expectedVersion,
      input.actor,
    );
    const candidate = await client.query<
      { assignment_id: string | null } & QueryResultRow
    >(
      `SELECT assignment.id AS assignment_id
       FROM catalog.taxonomy_term term
       LEFT JOIN catalog.track_term_assignment assignment
         ON assignment.term_id = term.id AND assignment.track_id = $2
        AND (assignment.submission_revision_id = $3 OR assignment.submission_revision_id IS NULL)
        AND assignment.source_kind = $4
       WHERE term.id = $1 AND term.is_active = true`,
      [
        input.termId,
        review.track_id,
        review.submission_revision_id,
        input.sourceKind,
      ],
    );
    const candidateRow = candidate.rows[0];
    if (
      !candidateRow ||
      (input.sourceKind !== "coordinator" && !candidateRow.assignment_id)
    )
      throw new ReviewRepositoryError(
        "INVALID_SOURCE",
        "That taxonomy source is unavailable.",
      );
    await client.query(
      `INSERT INTO workflow.review_term_selection
         (id, review_case_id, term_id, source_assignment_id, source_kind, decision, decided_by_user_id, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (review_case_id, term_id) DO UPDATE
       SET source_assignment_id=EXCLUDED.source_assignment_id, source_kind=EXCLUDED.source_kind,
           decision=EXCLUDED.decision, decided_by_user_id=EXCLUDED.decided_by_user_id, reason=EXCLUDED.reason`,
      [
        randomUUID(),
        input.reviewCaseId,
        input.termId,
        candidateRow.assignment_id,
        input.sourceKind,
        input.decision,
        input.actor.id,
        input.reason ?? null,
      ],
    );
    const version = await bumpCase(client, input.reviewCaseId);
    await event(
      client,
      input.reviewCaseId,
      input.actor.id,
      "taxonomy_updated",
      {
        termId: input.termId,
        decision: input.decision,
      },
    );
    return version;
  });
}

export async function saveChecklistDecision(
  pool: Pool,
  input: {
    reviewCaseId: string;
    code: string;
    status: string;
    note?: string;
    expectedVersion: number;
    actor: CurrentUser;
  },
): Promise<number> {
  return withTransaction(pool, async (client) => {
    const review = await lockEditableCase(
      client,
      input.reviewCaseId,
      input.expectedVersion,
      input.actor,
    );
    if (input.code === "stems" && input.status === "not_applicable") {
      const stems = await client.query<{ count: string } & QueryResultRow>(
        `SELECT count(*) FROM catalog.audio_asset WHERE submission_revision_id = $1 AND asset_role = 'stem'`,
        [review.submission_revision_id],
      );
      if (Number(stems.rows[0]!.count) > 0)
        throw new ReviewRepositoryError(
          "INVALID_SOURCE",
          "Stems cannot be not applicable when stems are present.",
        );
    }
    await client.query(
      `UPDATE workflow.review_check_item SET status=$2, note=$3, reviewed_by_user_id=$4,
       reviewed_at=CASE WHEN $2='pending' THEN NULL ELSE now() END
       WHERE review_case_id=$1 AND code=$5`,
      [
        input.reviewCaseId,
        input.status,
        input.note ?? null,
        input.actor.id,
        input.code,
      ],
    );
    const version = await bumpCase(client, input.reviewCaseId);
    await event(
      client,
      input.reviewCaseId,
      input.actor.id,
      "checklist_updated",
      {
        code: input.code,
        status: input.status,
      },
    );
    return version;
  });
}

export async function appendReviewNote(
  pool: Pool,
  input: {
    reviewCaseId: string;
    category: string;
    body: string;
    expectedVersion: number;
    actor: CurrentUser;
  },
): Promise<number> {
  return withTransaction(pool, async (client) => {
    await lockEditableCase(
      client,
      input.reviewCaseId,
      input.expectedVersion,
      input.actor,
    );
    await client.query(
      `INSERT INTO workflow.review_note (id, review_case_id, category, body, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        randomUUID(),
        input.reviewCaseId,
        input.category,
        input.body,
        input.actor.id,
      ],
    );
    const version = await bumpCase(client, input.reviewCaseId);
    await event(client, input.reviewCaseId, input.actor.id, "note_added", {
      category: input.category,
    });
    return version;
  });
}

export async function releaseReview(
  pool: Pool,
  reviewCaseId: string,
  expectedVersion: number,
  actor: CurrentUser,
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const review = await lockEditableCase(
      client,
      reviewCaseId,
      expectedVersion,
      actor,
    );
    if (actor.role !== "admin" && review.assigned_to_user_id !== actor.id)
      throw new ReviewRepositoryError(
        "READ_ONLY",
        "Only your own review can be released.",
      );
    await client.query(
      `UPDATE workflow.review_case SET assigned_to_user_id=NULL, row_version=row_version+1 WHERE id=$1`,
      [reviewCaseId],
    );
    await event(client, reviewCaseId, actor.id, "released");
  });
}

export async function reassignReview(
  pool: Pool,
  reviewCaseId: string,
  assigneeUserId: string,
  expectedVersion: number,
  actor: CurrentUser,
): Promise<void> {
  if (!canReassignReview(actor))
    throw new ReviewRepositoryError(
      "READ_ONLY",
      "Only Admin can reassign reviews.",
    );
  await withTransaction(pool, async (client) => {
    await lockEditableCase(client, reviewCaseId, expectedVersion, actor);
    const eligible = await client.query(
      `SELECT 1 FROM auth.team_access
       WHERE auth_user_id=$1 AND status='active' AND role IN ('admin','coordinator')`,
      [assigneeUserId],
    );
    if (eligible.rowCount !== 1)
      throw new ReviewRepositoryError(
        "NOT_FOUND",
        "Eligible reviewer was not found.",
      );
    await client.query(
      `UPDATE workflow.review_case SET assigned_to_user_id=$2, row_version=row_version+1 WHERE id=$1`,
      [reviewCaseId, assigneeUserId],
    );
    await event(client, reviewCaseId, actor.id, "reassigned", {
      assigneeUserId,
    });
  });
}

export async function markReadyForDecision(
  pool: Pool,
  reviewCaseId: string,
  expectedVersion: number,
  actor: CurrentUser,
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const review = await lockEditableCase(
      client,
      reviewCaseId,
      expectedVersion,
      actor,
    );
    const checks = await client.query<
      { code: string; status: string; note: string | null } & QueryResultRow
    >(
      `SELECT code,status,note FROM workflow.review_check_item WHERE review_case_id=$1`,
      [reviewCaseId],
    );
    if (
      checks.rows.length !== REVIEW_CHECK_CODES.length ||
      checks.rows.some(
        (item) =>
          item.status === "pending" ||
          (item.status === "attention" && !item.note?.trim()),
      )
    ) {
      throw new ReviewRepositoryError(
        "INCOMPLETE",
        "Complete every checklist item before marking this review ready.",
      );
    }
    const draft = await client.query<
      { fields: Record<string, unknown> } & QueryResultRow
    >(
      `SELECT fields FROM workflow.review_metadata_draft WHERE review_case_id=$1`,
      [reviewCaseId],
    );
    const fields = draft.rows[0]?.fields ?? {};
    const required =
      review.asset_kind === "music"
        ? ["title", "vocalState", "format"]
        : ["title"];
    if (
      required.some(
        (field) =>
          !(fields[field] as { reviewed?: boolean } | undefined)?.reviewed,
      )
    )
      throw new ReviewRepositoryError(
        "INCOMPLETE",
        "Review all required core metadata fields before continuing.",
      );
    if (review.asset_kind === "music") {
      const editorial = await client.query(
        `SELECT 1 FROM workflow.review_term_selection selection
         JOIN catalog.taxonomy_term term ON term.id=selection.term_id
         WHERE selection.review_case_id=$1 AND selection.decision='selected' AND term.category='use_case' LIMIT 1`,
        [reviewCaseId],
      );
      if (editorial.rowCount !== 1)
        throw new ReviewRepositoryError(
          "INCOMPLETE",
          "Select at least one Use Case before continuing.",
        );
    }
    await client.query(
      `UPDATE workflow.review_case SET status='ready_for_decision', ready_for_decision_at=now(),
       row_version=row_version+1 WHERE id=$1`,
      [reviewCaseId],
    );
    await event(client, reviewCaseId, actor.id, "ready_for_decision");
  });
}

export async function reopenReview(
  pool: Pool,
  reviewCaseId: string,
  expectedVersion: number,
  actor: CurrentUser,
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const result = await client.query<LockedCase & QueryResultRow>(
      `SELECT review.id, review.submission_id, review.submission_revision_id, review.track_id,
              review.status, review.assigned_to_user_id, review.row_version, track.asset_kind
       FROM workflow.review_case review
       JOIN workflow.submission submission ON submission.id=review.submission_id AND submission.status='in_review'
       JOIN catalog.track track ON track.id=review.track_id
       WHERE review.id=$1 FOR UPDATE OF review`,
      [reviewCaseId],
    );
    const review = result.rows[0];
    if (!review)
      throw new ReviewRepositoryError("NOT_FOUND", "Review was not found.");
    if (Number(review.row_version) !== expectedVersion)
      throw new ReviewRepositoryError("CONFLICT", REVIEW_CONFLICT_MESSAGE);
    if (review.status !== "ready_for_decision")
      throw new ReviewRepositoryError(
        "READ_ONLY",
        "Only a ready review can be reopened.",
      );
    if (actor.role !== "admin" && review.assigned_to_user_id !== actor.id)
      throw new ReviewRepositoryError(
        "READ_ONLY",
        "This review is read-only for you.",
      );
    await client.query(
      `UPDATE workflow.review_case SET status='in_progress', ready_for_decision_at=NULL,
       reopened_at=now(), row_version=row_version+1 WHERE id=$1`,
      [reviewCaseId],
    );
    await event(client, reviewCaseId, actor.id, "reopened");
  });
}

export async function buildReviewDecisionPacket(
  database: Queryable,
  reviewCaseId: string,
): Promise<ReviewDecisionPacket> {
  const result = await database.query<
    {
      id: string;
      submission_id: string;
      submission_revision_id: string;
      track_id: string;
      row_version: string;
      ready_for_decision_at: Date;
      fields: ReviewDecisionPacket["coordinatorMetadataDraft"];
      checklist: ReviewDecisionPacket["checklist"];
      terms: ReviewDecisionPacket["terms"];
      rights_summary: Record<string, unknown> | null;
      copyright_summary: Record<string, unknown> | null;
    } & QueryResultRow
  >(
    `SELECT review.id, review.submission_id, review.submission_revision_id, review.track_id,
            review.row_version, review.ready_for_decision_at, draft.fields,
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'code', item.code, 'status', item.status, 'note', item.note,
              'reviewedAt', item.reviewed_at) ORDER BY item.code)
              FROM workflow.review_check_item item WHERE item.review_case_id=review.id), '[]'::jsonb) AS checklist,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('termId', selection.term_id, 'sourceKind', selection.source_kind))
              FROM workflow.review_term_selection selection
              WHERE selection.review_case_id=review.id AND selection.decision='selected'), '[]'::jsonb) AS terms
            ,(SELECT jsonb_build_object(
                'masterRightsBasis', rights.master_rights_basis,
                'compositionRightsBasis', rights.composition_rights_basis,
                'oneStopClearance', rights.one_stop_clearance,
                'contentIdEligibility', rights.content_id_eligibility)
              FROM rights.rights_declaration rights
              WHERE rights.submission_revision_id=review.submission_revision_id) AS rights_summary
            ,(SELECT jsonb_build_object(
                'status', copyright.status, 'outcome', copyright.outcome,
                'eligibilityStatus', copyright.eligibility_status,
                'readinessStatus', copyright.readiness_status)
              FROM rights.copyright_check copyright
              WHERE copyright.submission_revision_id=review.submission_revision_id AND copyright.is_current) AS copyright_summary
     FROM workflow.review_case review
     JOIN workflow.submission submission ON submission.id=review.submission_id
       AND submission.current_revision_id=review.submission_revision_id AND submission.status='in_review'
     JOIN workflow.review_metadata_draft draft ON draft.review_case_id=review.id
     WHERE review.id=$1 AND review.status='ready_for_decision'`,
    [reviewCaseId],
  );
  const row = result.rows[0];
  if (!row)
    throw new ReviewRepositoryError(
      "NOT_REVIEWABLE",
      "Review is not ready for a Section 8 decision.",
    );
  return {
    reviewCaseId: row.id,
    submissionId: row.submission_id,
    revisionId: row.submission_revision_id,
    trackId: row.track_id,
    reviewStatus: "ready_for_decision",
    reviewVersion: Number(row.row_version),
    coordinatorMetadataDraft: row.fields,
    terms: row.terms,
    checklist: row.checklist,
    attentionItems: row.checklist.filter((item) => item.status === "attention"),
    rightsSummary: row.rights_summary,
    copyrightSummary: row.copyright_summary,
    lockedAt: iso(row.ready_for_decision_at)!,
  };
}
