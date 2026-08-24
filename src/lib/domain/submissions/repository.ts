import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type {
  CreateDraftSubmissionInput,
  SubmissionDto,
  SubmissionRevisionDto,
  SubmissionStatus,
} from "@/types/domain/submission";

import { assertSubmissionTransition } from "./lifecycle";
import { mapSubmissionRevisionRow, mapSubmissionRow } from "./mapper";
import type { SubmissionRevisionRow, SubmissionRow } from "./mapper";
import {
  createDraftSubmissionInputSchema,
  createSubmissionRevisionInputSchema,
} from "./validation";

type Queryable = Pick<Pool | PoolClient, "query">;
type SubmissionQueryRow = SubmissionRow & QueryResultRow;
type RevisionQueryRow = SubmissionRevisionRow & QueryResultRow;

const SUBMISSION_SELECT = `
  SELECT submission.id, submission.track_id, submission.batch_id,
         submission.owner_user_id, submission.status,
         submission.current_revision_id, submission.latest_revision_number,
         submission.row_version, submission.created_at, submission.updated_at,
         track.title, track.asset_kind, track.version_type
  FROM workflow.submission submission
  JOIN catalog.track track ON track.id = submission.track_id`;

export class SubmissionRepositoryError extends Error {
  constructor(
    public readonly code:
      "SUBMISSION_NOT_FOUND" | "SUBMISSION_CONFLICT" | "REVISION_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "SubmissionRepositoryError";
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

async function selectSubmission(
  database: Queryable,
  where: string,
  values: unknown[],
): Promise<SubmissionDto | null> {
  const result = await database.query<SubmissionQueryRow>(
    `${SUBMISSION_SELECT} WHERE ${where} LIMIT 1`,
    values,
  );
  return result.rows[0] ? mapSubmissionRow(result.rows[0]) : null;
}

export async function createDraftSubmission(
  pool: Pool,
  input: CreateDraftSubmissionInput,
): Promise<SubmissionDto> {
  const parsed = createDraftSubmissionInputSchema.parse(input);
  return withTransaction(pool, async (client) => {
    const trackId = randomUUID();
    const submissionId = randomUUID();
    await client.query(
      `INSERT INTO catalog.track (
         id, composition_id, parent_track_id, asset_kind, title,
         version_type, version_label, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        trackId,
        parsed.compositionId ?? null,
        parsed.parentTrackId ?? null,
        parsed.assetKind,
        parsed.title || null,
        parsed.versionType,
        parsed.versionLabel || null,
        parsed.actorUserId,
      ],
    );
    await client.query(
      `INSERT INTO workflow.submission (
         id, track_id, batch_id, owner_user_id
       ) VALUES ($1, $2, $3, $4)`,
      [submissionId, trackId, parsed.batchId ?? null, parsed.ownerUserId],
    );
    await client.query(
      `INSERT INTO workflow.submission_event (
         id, submission_id, actor_user_id, event_type, to_status
       ) VALUES ($1, $2, $3, 'created', 'draft')`,
      [randomUUID(), submissionId, parsed.actorUserId],
    );
    const created = await selectSubmission(client, "submission.id = $1", [
      submissionId,
    ]);
    if (!created) {
      throw new SubmissionRepositoryError(
        "SUBMISSION_NOT_FOUND",
        "Draft submission could not be read after creation",
      );
    }
    return created;
  });
}

export async function createSubmissionRevision(
  pool: Pool,
  input: {
    submissionId: string;
    submissionOwnerUserId: string;
    actorUserId: string;
    producerMetadata?: Record<string, unknown>;
    embeddedMetadata?: Record<string, unknown>;
    sourceNotes?: string | null;
  },
): Promise<SubmissionRevisionDto> {
  const parsed = createSubmissionRevisionInputSchema.parse(input);
  return withTransaction(pool, async (client) => {
    const locked = await client.query<
      {
        status: SubmissionStatus;
        latest_revision_number: number;
        current_revision_id: string | null;
      } & QueryResultRow
    >(
      `SELECT status, latest_revision_number, current_revision_id
       FROM workflow.submission
       WHERE id = $1 AND owner_user_id = $2
       FOR UPDATE`,
      [parsed.submissionId, parsed.submissionOwnerUserId],
    );
    const submission = locked.rows[0];
    if (!submission) {
      throw new SubmissionRepositoryError(
        "SUBMISSION_NOT_FOUND",
        "Submission was not found for this owner",
      );
    }
    if (
      submission.status !== "draft" &&
      submission.status !== "changes_requested"
    ) {
      throw new SubmissionRepositoryError(
        "SUBMISSION_CONFLICT",
        "A revision can only be drafted before submission or after changes are requested",
      );
    }
    if (submission.status === "draft" && submission.current_revision_id) {
      throw new SubmissionRepositoryError(
        "SUBMISSION_CONFLICT",
        "This submission already has a draft revision",
      );
    }
    const revisionId = randomUUID();
    const revisionNumber = submission.latest_revision_number + 1;
    const inserted = await client.query<RevisionQueryRow>(
      `INSERT INTO workflow.submission_revision (
         id, submission_id, revision_number, created_by_user_id,
         producer_metadata, embedded_metadata, source_notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        revisionId,
        parsed.submissionId,
        revisionNumber,
        parsed.actorUserId,
        parsed.producerMetadata,
        parsed.embeddedMetadata,
        parsed.sourceNotes || null,
      ],
    );
    await client.query(
      `UPDATE workflow.submission
       SET current_revision_id = $2,
           latest_revision_number = $3,
           row_version = row_version + 1
       WHERE id = $1`,
      [parsed.submissionId, revisionId, revisionNumber],
    );
    const revision = inserted.rows[0];
    if (!revision) {
      throw new SubmissionRepositoryError(
        "SUBMISSION_CONFLICT",
        "Submission Revision could not be read after creation",
      );
    }
    return mapSubmissionRevisionRow(revision);
  });
}

export async function getSubmissionById(
  database: Queryable,
  submissionId: string,
): Promise<SubmissionDto | null> {
  return selectSubmission(database, "submission.id = $1", [submissionId]);
}

export async function getSubmissionForProducer(
  database: Queryable,
  submissionId: string,
  ownerUserId: string,
): Promise<SubmissionDto | null> {
  return selectSubmission(
    database,
    "submission.id = $1 AND submission.owner_user_id = $2",
    [submissionId, ownerUserId],
  );
}

export async function listProducerSubmissions(
  database: Queryable,
  ownerUserId: string,
  limit = 100,
): Promise<SubmissionDto[]> {
  const result = await database.query<SubmissionQueryRow>(
    `${SUBMISSION_SELECT}
     WHERE submission.owner_user_id = $1
     ORDER BY submission.updated_at DESC, submission.id
     LIMIT $2`,
    [ownerUserId, Math.min(Math.max(limit, 1), 250)],
  );
  return result.rows.map(mapSubmissionRow);
}

export async function listAllSubmissions(
  database: Queryable,
  limit = 100,
): Promise<SubmissionDto[]> {
  const result = await database.query<SubmissionQueryRow>(
    `${SUBMISSION_SELECT}
     ORDER BY submission.updated_at DESC, submission.id
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 250)],
  );
  return result.rows.map(mapSubmissionRow);
}

export async function listReviewableSubmissions(
  database: Queryable,
  limit = 100,
): Promise<SubmissionDto[]> {
  const result = await database.query<SubmissionQueryRow>(
    `${SUBMISSION_SELECT}
     WHERE submission.status IN (
       'ready_for_review', 'in_review', 'rejection_recommended'
     )
     ORDER BY submission.updated_at ASC, submission.id
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 250)],
  );
  return result.rows.map(mapSubmissionRow);
}

function eventTypeForTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
):
  | "submitted"
  | "resubmitted"
  | "processing_started"
  | "ready_for_review"
  | "review_started"
  | "changes_requested"
  | "rejection_recommended"
  | "approved"
  | "rejected" {
  if (to === "submitted") {
    return from === "changes_requested" ? "resubmitted" : "submitted";
  }
  switch (to) {
    case "processing":
      return "processing_started";
    case "ready_for_review":
      return "ready_for_review";
    case "in_review":
      return "review_started";
    case "changes_requested":
      return "changes_requested";
    case "rejection_recommended":
      return "rejection_recommended";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    default:
      throw new Error(`No event is defined for transition to ${to}`);
  }
}

export async function transitionSubmissionStatus(
  pool: Pool,
  input: {
    submissionId: string;
    expectedStatus: SubmissionStatus;
    nextStatus: SubmissionStatus;
    actorUserId: string;
    reason?: string | null;
  },
): Promise<SubmissionDto> {
  assertSubmissionTransition(input.expectedStatus, input.nextStatus);
  return withTransaction(pool, async (client) => {
    const updated = await client.query<
      {
        current_revision_id: string | null;
      } & QueryResultRow
    >(
      `UPDATE workflow.submission
       SET status = $3,
           row_version = row_version + 1,
           submitted_at = CASE WHEN $3 = 'submitted' THEN now() ELSE submitted_at END,
           review_started_at = CASE WHEN $3 = 'in_review' THEN now() ELSE review_started_at END,
           approved_at = CASE WHEN $3 = 'approved' THEN now() ELSE approved_at END,
           rejected_at = CASE WHEN $3 = 'rejected' THEN now() ELSE rejected_at END
       WHERE id = $1
         AND status = $2
         AND ($3 <> 'submitted' OR current_revision_id IS NOT NULL)
       RETURNING current_revision_id`,
      [input.submissionId, input.expectedStatus, input.nextStatus],
    );
    const state = updated.rows[0];
    if (!state) {
      throw new SubmissionRepositoryError(
        input.nextStatus === "submitted"
          ? "REVISION_REQUIRED"
          : "SUBMISSION_CONFLICT",
        input.nextStatus === "submitted"
          ? "A current draft revision is required before submission"
          : "Submission status changed before this action completed",
      );
    }

    if (input.nextStatus === "submitted" && state.current_revision_id) {
      const revision = await client.query(
        `UPDATE workflow.submission_revision
         SET revision_status = 'submitted', submitted_at = now()
         WHERE id = $1 AND revision_status = 'draft'`,
        [state.current_revision_id],
      );
      if (revision.rowCount !== 1) {
        throw new SubmissionRepositoryError(
          "REVISION_REQUIRED",
          "The current Submission Revision is not a draft",
        );
      }
      await client.query(
        `INSERT INTO analysis.revision_analysis
           (id, submission_revision_id, track_id, overall_status)
         SELECT $1, submission.current_revision_id, submission.track_id, 'queued'
         FROM workflow.submission submission WHERE submission.id = $2
         ON CONFLICT (submission_revision_id) DO NOTHING`,
        [randomUUID(), input.submissionId],
      );
      await client.query(
        `INSERT INTO analysis.processing_job
           (id, job_type, submission_id, submission_revision_id, idempotency_key)
         VALUES ($1,'revision_processing',$2,$3,$4)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          randomUUID(),
          input.submissionId,
          state.current_revision_id,
          `revision:${state.current_revision_id}:processing`,
        ],
      );
      await client.query(
        `UPDATE workflow.submission_revision
         SET revision_status = 'superseded'
         WHERE submission_id = $1
           AND id <> $2
           AND revision_status = 'submitted'`,
        [input.submissionId, state.current_revision_id],
      );
    }
    if (
      (input.nextStatus === "approved" || input.nextStatus === "rejected") &&
      state.current_revision_id
    ) {
      await client.query(
        `UPDATE workflow.submission_revision
         SET revision_status = $2
         WHERE id = $1`,
        [
          state.current_revision_id,
          input.nextStatus === "approved" ? "accepted" : "rejected",
        ],
      );
    }

    await client.query(
      `INSERT INTO workflow.submission_event (
         id, submission_id, submission_revision_id, actor_user_id,
         event_type, from_status, to_status, reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        input.submissionId,
        state.current_revision_id,
        input.actorUserId,
        eventTypeForTransition(input.expectedStatus, input.nextStatus),
        input.expectedStatus,
        input.nextStatus,
        input.reason?.trim() || null,
      ],
    );
    const submission = await selectSubmission(client, "submission.id = $1", [
      input.submissionId,
    ]);
    if (!submission) {
      throw new SubmissionRepositoryError(
        "SUBMISSION_NOT_FOUND",
        "Submission was not found after transition",
      );
    }
    return submission;
  });
}
