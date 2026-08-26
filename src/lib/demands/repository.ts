import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";

import { hasPermission } from "@/lib/auth/permissions";
import { parseMediaConfig } from "@/lib/media/config";
import type { CurrentUser } from "@/types/auth";
import type {
  DemandDetail,
  DemandEvent,
  DemandFitResult,
  DemandListFilters,
  DemandReferenceTrack,
  DemandResponse,
  DemandSearchProjection,
  DemandSummary,
  DemandTermRequirement,
  DemandStatus,
} from "@/types/demands";

import { canSeeDemand, canSeeResponse } from "./authorization";
import { evaluateTrackAgainstDemand } from "./fit";
import {
  assertDemandTransition,
  deriveDemandState,
  responseWindowOpen,
} from "./lifecycle";
import {
  demandCreateSchema,
  demandListFiltersSchema,
  demandResponseInputSchema,
  demandTransitionSchema,
  demandUpdateSchema,
  hasMeaningfulCreativeRequirement,
  hasMusicUseCaseOrFormat,
  responseMutationSchema,
  type DemandInput,
} from "./validation";

type Queryable = Pick<Pool | PoolClient, "query">;

interface ResponseRow extends QueryResultRow {
  id: string;
  demand_id: string;
  track_id: string;
  track_title: string | null;
  submission_id: string | null;
  submission_status: DemandResponse["submissionStatus"];
  origin: DemandResponse["origin"];
  status: DemandResponse["status"];
  responder_user_id: string;
  responder_name: string | null;
  pitch_note: string | null;
  decline_reason: string | null;
  brief_version_started: string | number;
  brief_version_submitted: string | number | null;
  submitted_published_revision_id: string | null;
  accepted_published_revision_id: string | null;
  current_published_revision_id: string | null;
  published_revision_id: string | null;
  publication_status: string;
  playback_status: DemandResponse["playbackStatus"];
  master_playback_ready: boolean;
  row_version: string | number;
  submitted_at: Date | string | null;
  updated_at: Date | string;
}

interface ReferenceRow extends QueryResultRow {
  id: string;
  track_id: string;
  note: string | null;
  title: string | null;
  publication_status: string;
  bpm: string | number | null;
  duration_ms: string | number | null;
  format: string | null;
  use_cases: string[] | null;
  playback_status: DemandReferenceTrack["playbackStatus"];
  master_playback_ready: boolean;
}

interface EventRow extends QueryResultRow {
  id: string;
  response_id: string | null;
  event_type: string;
  event_metadata: Record<string, unknown> | null;
  created_at: Date | string;
  actor_name: string | null;
}

interface LockedDemandRow extends QueryResultRow {
  [key: string]: string | number | boolean | Date | null;
  id: string;
  status: DemandStatus;
  brief_version: string | number;
  row_version: string | number;
  response_deadline_on: Date | string;
  today: Date | string;
}

interface DemandFitRow extends QueryResultRow {
  asset_kind: DemandSummary["assetKind"];
  bpm_min: string | number | null;
  bpm_max: string | number | null;
  duration_min_ms: string | number | null;
  duration_max_ms: string | number | null;
  vocal_state: DemandSummary["vocalState"];
  under_dialogue: boolean | null;
  loopable: boolean | null;
  stems_required: boolean;
  ending_type: DemandSummary["endingType"];
}

interface TrackFitRow extends QueryResultRow {
  asset_kind: DemandSummary["assetKind"];
  bpm: string | number | null;
  duration_ms: string | number | null;
  vocal_state: DemandSummary["vocalState"];
  under_dialogue: boolean | null;
  loopable: boolean | null;
  stem_count: string | number;
  ending_type: DemandSummary["endingType"];
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export const DEMAND_CONFLICT_MESSAGE =
  "This Demand changed while you were editing it. Refresh and try again.";

export class DemandRepositoryError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID"
      | "FIT_BLOCKED"
      | "DUPLICATE",
    message: string,
    public readonly blockers: string[] = [],
  ) {
    super(message);
    this.name = "DemandRepositoryError";
  }
}

async function transaction<T>(
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

function assertPermission(
  user: CurrentUser,
  permission:
    "demand.read" | "demand.create" | "demand.manage" | "demand.respond",
) {
  if (!hasPermission(user.role, permission))
    throw new DemandRepositoryError(
      "FORBIDDEN",
      "Demand Sheet access is denied.",
    );
}

function displayNumber(value: string | number) {
  return `DMD-${String(value).padStart(6, "0")}`;
}

function iso(value: Date | string | null): string | null {
  return value
    ? (value instanceof Date ? value : new Date(value)).toISOString()
    : null;
}

function date(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

interface DemandRow extends QueryResultRow {
  id: string;
  demand_number: string;
  title: string;
  requester_name: string | null;
  requesting_team: string | null;
  project_context: string;
  brief: string;
  creative_notes: string | null;
  avoid_notes: string | null;
  priority: DemandSummary["priority"];
  status: DemandStatus;
  asset_kind: DemandSummary["assetKind"];
  target_track_count: number;
  response_deadline_on: Date | string;
  needed_by_on: Date | string;
  bpm_min: string | number | null;
  bpm_max: string | number | null;
  duration_min_ms: string | number | null;
  duration_max_ms: string | number | null;
  vocal_state: DemandSummary["vocalState"];
  under_dialogue: boolean | null;
  loopable: boolean | null;
  stems_required: boolean;
  ending_type: DemandSummary["endingType"];
  owner_user_id: string;
  owner_name: string;
  created_by_user_id: string;
  brief_version: string;
  row_version: string;
  status_reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  assigned_to_me: boolean;
  working_count: string;
  submitted_count: string;
  shortlisted_count: string;
  accepted_count: string;
  valid_accepted_count: string;
  today: Date | string;
  due_soon: boolean;
}

function numberOrNull(value: string | number | null): number | null {
  return value == null ? null : Number(value);
}

function mapDemand(row: DemandRow): DemandSummary {
  const coverage = {
    working: Number(row.working_count),
    submitted: Number(row.submitted_count),
    shortlisted: Number(row.shortlisted_count),
    accepted: Number(row.accepted_count),
    validAccepted: Number(row.valid_accepted_count),
  };
  const derived = deriveDemandState({
    status: row.status,
    responseDeadlineOn: date(row.response_deadline_on),
    today: date(row.today),
    activeResponseCount:
      coverage.working + coverage.submitted + coverage.shortlisted,
    validAcceptedCount: coverage.validAccepted,
    targetTrackCount: row.target_track_count,
    acceptedCount: coverage.accepted,
  });
  return {
    id: row.id,
    displayNumber: displayNumber(row.demand_number),
    title: row.title,
    requesterName: row.requester_name,
    requestingTeam: row.requesting_team,
    projectContext: row.project_context,
    brief: row.brief,
    creativeNotes: row.creative_notes,
    avoidNotes: row.avoid_notes,
    priority: row.priority,
    status: row.status,
    assetKind: row.asset_kind,
    targetTrackCount: row.target_track_count,
    responseDeadlineOn: date(row.response_deadline_on),
    neededByOn: date(row.needed_by_on),
    bpmMin: numberOrNull(row.bpm_min),
    bpmMax: numberOrNull(row.bpm_max),
    durationMinMs: numberOrNull(row.duration_min_ms),
    durationMaxMs: numberOrNull(row.duration_max_ms),
    vocalState: row.vocal_state,
    underDialogue: row.under_dialogue,
    loopable: row.loopable,
    stemsRequired: row.stems_required,
    endingType: row.ending_type,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    createdByUserId: row.created_by_user_id,
    briefVersion: Number(row.brief_version),
    rowVersion: Number(row.row_version),
    statusReason: row.status_reason,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    assignedToCurrentUser: row.assigned_to_me,
    dueSoon: row.due_soon,
    coverage,
    ...derived,
  };
}

const VALID_ACCEPTED_SQL = `
    response.status='accepted'
    AND track.publication_status='published'
    AND track.published_revision_id=response.accepted_published_revision_id
    AND track.asset_kind=demand.asset_kind
    AND (demand.bpm_min IS NULL OR (SELECT metadata.bpm FROM catalog.track_metadata metadata WHERE metadata.track_id=track.id) >= demand.bpm_min)
    AND (demand.bpm_max IS NULL OR (SELECT metadata.bpm FROM catalog.track_metadata metadata WHERE metadata.track_id=track.id) <= demand.bpm_max)
    AND (demand.duration_min_ms IS NULL OR (SELECT result.duration_ms FROM catalog.audio_asset asset JOIN analysis.file_technical_result result ON result.asset_id=asset.id WHERE asset.track_id=track.id AND asset.submission_revision_id=track.published_revision_id AND asset.asset_role='master' ORDER BY result.processed_at DESC LIMIT 1) >= demand.duration_min_ms)
    AND (demand.duration_max_ms IS NULL OR (SELECT result.duration_ms FROM catalog.audio_asset asset JOIN analysis.file_technical_result result ON result.asset_id=asset.id WHERE asset.track_id=track.id AND asset.submission_revision_id=track.published_revision_id AND asset.asset_role='master' ORDER BY result.processed_at DESC LIMIT 1) <= demand.duration_max_ms)
    AND (demand.vocal_state IS NULL OR (SELECT metadata.vocal_state FROM catalog.track_metadata metadata WHERE metadata.track_id=track.id)=demand.vocal_state)
    AND (demand.under_dialogue IS NULL OR (SELECT metadata.under_dialogue FROM catalog.track_metadata metadata WHERE metadata.track_id=track.id)=demand.under_dialogue)
    AND (demand.loopable IS NULL OR (SELECT metadata.loopable FROM catalog.track_metadata metadata WHERE metadata.track_id=track.id)=demand.loopable)
    AND (NOT demand.stems_required OR EXISTS (SELECT 1 FROM catalog.audio_asset stem WHERE stem.track_id=track.id AND stem.submission_revision_id=track.published_revision_id AND stem.asset_role='stem'))
    AND (demand.ending_type IS NULL OR (SELECT metadata.ending_type FROM catalog.track_metadata metadata WHERE metadata.track_id=track.id)=demand.ending_type)
    AND NOT EXISTS (
      SELECT 1 FROM planning.demand_term_requirement required_requirement
      JOIN catalog.taxonomy_term required_term ON required_term.id=required_requirement.term_id
      WHERE required_requirement.demand_id=demand.id
        AND required_requirement.importance='required'
        AND (required_term.is_active=false OR NOT EXISTS (
          SELECT 1 FROM catalog.track_term_assignment accepted_assignment
          WHERE accepted_assignment.track_id=track.id
            AND accepted_assignment.term_id=required_requirement.term_id
            AND accepted_assignment.review_status='accepted'
        ))
    )`;

const DEMAND_SELECT = `
  SELECT demand.*, owner.name AS owner_name, CURRENT_DATE AS today, count(*) OVER()::text AS total_count,
    EXISTS (SELECT 1 FROM planning.demand_assignee assignee WHERE assignee.demand_id=demand.id AND assignee.user_id=$1) AS assigned_to_me,
    (demand.status='open' AND demand.response_deadline_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS due_soon,
    count(response.id) FILTER (WHERE response.status='working')::text AS working_count,
    count(response.id) FILTER (WHERE response.status='submitted')::text AS submitted_count,
    count(response.id) FILTER (WHERE response.status='shortlisted')::text AS shortlisted_count,
    count(response.id) FILTER (WHERE response.status='accepted')::text AS accepted_count,
    count(response.id) FILTER (WHERE ${VALID_ACCEPTED_SQL})::text AS valid_accepted_count
  FROM planning.demand demand
  JOIN auth."user" owner ON owner.id=demand.owner_user_id
  LEFT JOIN planning.demand_response response ON response.demand_id=demand.id
  LEFT JOIN catalog.track track ON track.id=response.track_id`;

export async function listDemands(
  database: Queryable,
  user: CurrentUser,
  raw: Partial<Record<string, unknown>> = {},
) {
  assertPermission(user, "demand.read");
  const filters = demandListFiltersSchema.parse(raw) as DemandListFilters;
  const values: unknown[] = [user.id];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const conditions = [
    user.role === "music_producer" ? `demand.status <> 'draft'` : "true",
  ];
  if (filters.status !== "all")
    conditions.push(`demand.status=${bind(filters.status)}`);
  if (filters.priority !== "all")
    conditions.push(`demand.priority=${bind(filters.priority)}`);
  if (filters.ownerUserId !== "all")
    conditions.push(`demand.owner_user_id=${bind(filters.ownerUserId)}`);
  if (filters.query) {
    const query = bind(
      `%${filters.query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
    );
    const number = filters.query.toUpperCase().replace(/^DMD-0*/, "");
    conditions.push(`(demand.title ILIKE ${query} ESCAPE '\\' OR demand.project_context ILIKE ${query} ESCAPE '\\'
      OR coalesce(demand.requester_name,'') ILIKE ${query} ESCAPE '\\' OR coalesce(demand.requesting_team,'') ILIKE ${query} ESCAPE '\\'
      OR (${bind(/^\d+$/.test(number) ? Number(number) : -1)}::bigint = demand.demand_number))`);
  }
  if (filters.timing === "overdue")
    conditions.push(
      `demand.status='open' AND demand.response_deadline_on < CURRENT_DATE`,
    );
  if (filters.timing === "due_soon")
    conditions.push(
      `demand.status='open' AND demand.response_deadline_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`,
    );
  if (filters.assignedToMe)
    conditions.push(
      `EXISTS (SELECT 1 FROM planning.demand_assignee mine WHERE mine.demand_id=demand.id AND mine.user_id=$1)`,
    );
  if (filters.myResponse !== "all")
    conditions.push(
      `EXISTS (SELECT 1 FROM planning.demand_response mine_response WHERE mine_response.demand_id=demand.id AND mine_response.responder_user_id=$1 AND mine_response.status=${bind(filters.myResponse)})`,
    );
  const sorts = {
    priority: `CASE demand.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, demand.response_deadline_on, demand.demand_number`,
    response_deadline: "demand.response_deadline_on, demand.demand_number",
    needed_by: "demand.needed_by_on, demand.demand_number",
    newest: "demand.created_at DESC, demand.demand_number DESC",
    oldest: "demand.created_at, demand.demand_number",
  } as const;
  const limit = bind(filters.pageSize);
  const offset = bind((filters.page - 1) * filters.pageSize);
  const result = await database.query<DemandRow & { total_count: string }>(
    `${DEMAND_SELECT}
    WHERE ${conditions.join(" AND ")}
    GROUP BY demand.id, owner.name
    ORDER BY ${sorts[filters.sort]} LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  return {
    filters,
    items: result.rows.map(mapDemand),
    total: Number(result.rows[0]?.total_count ?? result.rowCount ?? 0),
  };
}

export async function getDemandMetrics(database: Queryable, user: CurrentUser) {
  assertPermission(user, "demand.read");
  const producer = user.role === "music_producer";
  const result = await database.query<QueryResultRow & Record<string, string>>(
    `SELECT
      count(*) FILTER (WHERE demand.status='open')::text AS open_count,
      count(*) FILTER (WHERE demand.status='open' AND demand.response_deadline_on<CURRENT_DATE)::text AS overdue_count,
      count(*) FILTER (WHERE demand.status='open' AND (
        SELECT count(*) FROM planning.demand_response response JOIN catalog.track track ON track.id=response.track_id
        WHERE response.demand_id=demand.id AND ${VALID_ACCEPTED_SQL}
      ) >= demand.target_track_count)::text AS ready_count,
      count(*) FILTER (WHERE demand.status='open' AND EXISTS (SELECT 1 FROM planning.demand_assignee assignee WHERE assignee.demand_id=demand.id AND assignee.user_id=$1))::text AS assigned_count,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM planning.demand_response response WHERE response.demand_id=demand.id AND response.responder_user_id=$1 AND response.status IN ('working','submitted','shortlisted')))::text AS my_active_count
     FROM planning.demand demand WHERE ($2::boolean AND demand.status<>'draft') OR NOT $2::boolean`,
    [user.id, producer],
  );
  const row = result.rows[0]!;
  return {
    open: Number(row.open_count),
    overdue: Number(row.overdue_count),
    ready: Number(row.ready_count),
    assigned: Number(row.assigned_count),
    myActive: Number(row.my_active_count),
  };
}

async function loadTerms(
  database: Queryable,
  demandId: string,
): Promise<DemandTermRequirement[]> {
  const result = await database.query<
    QueryResultRow & {
      id: string;
      term_id: string;
      category: DemandTermRequirement["category"];
      slug: string;
      label: string;
      is_active: boolean;
      importance: DemandTermRequirement["importance"];
    }
  >(
    `SELECT requirement.id,requirement.term_id,term.category,term.slug,term.label,term.is_active,requirement.importance
     FROM planning.demand_term_requirement requirement JOIN catalog.taxonomy_term term ON term.id=requirement.term_id
     WHERE requirement.demand_id=$1 ORDER BY requirement.importance,term.category,term.label,term.id`,
    [demandId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    termId: row.term_id,
    category: row.category,
    slug: row.slug,
    label: row.label,
    active: row.is_active,
    importance: row.importance,
  }));
}

async function loadResponses(
  database: Queryable,
  demandId: string,
  demandBriefVersion: number,
  user: CurrentUser,
): Promise<DemandResponse[]> {
  const manage = hasPermission(user.role, "demand.manage");
  const result = await database.query<ResponseRow>(
    `SELECT response.*,track.title AS track_title,track.publication_status,track.published_revision_id AS current_published_revision_id,
            submission.status AS submission_status,responder.name AS responder_name,
            CASE WHEN playback.status='ready' THEN 'ready' WHEN playback.status='failed' THEN 'failed' ELSE 'preparing' END AS playback_status,
            (playback.status='ready') AS master_playback_ready
     FROM planning.demand_response response JOIN catalog.track track ON track.id=response.track_id
     LEFT JOIN workflow.submission submission ON submission.id=response.submission_id
     LEFT JOIN auth."user" responder ON responder.id=response.responder_user_id
     LEFT JOIN LATERAL (
       SELECT artifact.status FROM catalog.audio_asset asset
       JOIN media.playback_artifact artifact ON artifact.audio_asset_id=asset.id
         AND artifact.submission_revision_id=track.published_revision_id AND artifact.profile_version=$4
       WHERE asset.track_id=track.id AND asset.submission_revision_id=track.published_revision_id AND asset.asset_role='master'
       ORDER BY artifact.updated_at DESC LIMIT 1
     ) playback ON true
     WHERE response.demand_id=$1 AND ($2::boolean OR response.responder_user_id=$3)
     ORDER BY CASE response.status WHEN 'accepted' THEN 0 WHEN 'shortlisted' THEN 1 WHEN 'submitted' THEN 2 ELSE 3 END,response.created_at,response.id`,
    [demandId, manage, user.id, parseMediaConfig().profileVersion],
  );
  return result.rows
    .filter((row) => canSeeResponse(user, row.responder_user_id))
    .map((row) => ({
      id: row.id,
      demandId: row.demand_id,
      trackId: row.track_id,
      trackTitle: row.track_title ?? "Untitled Track",
      submissionId: row.submission_id,
      submissionStatus: row.submission_status,
      origin: row.origin,
      status: row.status,
      responderUserId: row.responder_user_id,
      responderName: manage ? row.responder_name : null,
      pitchNote: row.pitch_note,
      declineReason: row.decline_reason,
      briefVersionStarted: Number(row.brief_version_started),
      briefVersionSubmitted:
        row.brief_version_submitted == null
          ? null
          : Number(row.brief_version_submitted),
      submittedPublishedRevisionId: row.submitted_published_revision_id,
      acceptedPublishedRevisionId: row.accepted_published_revision_id,
      currentPublishedRevisionId: row.current_published_revision_id,
      currentlyPublished: row.publication_status === "published",
      playbackStatus: row.playback_status,
      masterPlaybackReady: row.master_playback_ready,
      rowVersion: Number(row.row_version),
      submittedAt: iso(row.submitted_at),
      updatedAt: iso(row.updated_at)!,
      briefChanged:
        row.brief_version_submitted != null &&
        Number(row.brief_version_submitted) !== demandBriefVersion,
      trackChanged:
        row.submitted_published_revision_id != null &&
        row.submitted_published_revision_id !==
          row.current_published_revision_id,
    }));
}

export async function getDemandDetail(
  database: Queryable,
  demandId: string,
  user: CurrentUser,
): Promise<DemandDetail | null> {
  assertPermission(user, "demand.read");
  const base = await database.query<DemandRow>(
    `${DEMAND_SELECT} WHERE demand.id=$2 GROUP BY demand.id,owner.name`,
    [user.id, demandId],
  );
  const row = base.rows[0];
  if (!row || !canSeeDemand(user, row.status)) return null;
  const summary = mapDemand(row);
  const [requirements, assignees, references, responses, events] =
    await Promise.all([
      loadTerms(database, demandId),
      database.query<QueryResultRow & { user_id: string; name: string }>(
        `SELECT assignee.user_id,person.name FROM planning.demand_assignee assignee JOIN auth."user" person ON person.id=assignee.user_id WHERE assignee.demand_id=$1 ORDER BY person.name,assignee.user_id`,
        [demandId],
      ),
      database.query<ReferenceRow>(
        `SELECT reference.id,reference.track_id,reference.note,track.title,track.publication_status,metadata.bpm,
      technical.duration_ms,
      max(term.label) FILTER (WHERE term.category='format') AS format,
      coalesce(array_agg(term.label ORDER BY term.label) FILTER (WHERE term.category='use_case'),'{}') AS use_cases,
      CASE WHEN playback.status='ready' THEN 'ready' WHEN playback.status='failed' THEN 'failed' ELSE 'preparing' END AS playback_status,
      (playback.status='ready') AS master_playback_ready
      FROM planning.demand_reference_track reference JOIN catalog.track track ON track.id=reference.track_id
      LEFT JOIN catalog.track_metadata metadata ON metadata.track_id=track.id
      LEFT JOIN LATERAL (SELECT result.duration_ms FROM catalog.audio_asset asset JOIN analysis.file_technical_result result ON result.asset_id=asset.id WHERE asset.track_id=track.id AND asset.submission_revision_id=track.published_revision_id AND asset.asset_role='master' ORDER BY result.processed_at DESC LIMIT 1) technical ON true
      LEFT JOIN LATERAL (SELECT artifact.status FROM catalog.audio_asset asset JOIN media.playback_artifact artifact ON artifact.audio_asset_id=asset.id AND artifact.submission_revision_id=track.published_revision_id AND artifact.profile_version=$2 WHERE asset.track_id=track.id AND asset.submission_revision_id=track.published_revision_id AND asset.asset_role='master' ORDER BY artifact.updated_at DESC LIMIT 1) playback ON true
      LEFT JOIN catalog.track_term_assignment assignment ON assignment.track_id=track.id AND assignment.review_status='accepted'
      LEFT JOIN catalog.taxonomy_term term ON term.id=assignment.term_id AND term.is_active=true
      WHERE reference.demand_id=$1 GROUP BY reference.id,track.id,metadata.bpm,technical.duration_ms,playback.status ORDER BY reference.sort_order,reference.id`,
        [demandId, parseMediaConfig().profileVersion],
      ),
      loadResponses(database, demandId, summary.briefVersion, user),
      database.query<EventRow>(
        `SELECT event.id,event.response_id,event.event_type,event.event_metadata,event.created_at,actor.name AS actor_name FROM planning.demand_event event LEFT JOIN auth."user" actor ON actor.id=event.actor_user_id WHERE event.demand_id=$1 ORDER BY event.created_at DESC,event.id DESC LIMIT 100`,
        [demandId],
      ),
    ]);
  const mappedReferences: DemandReferenceTrack[] = references.rows.map(
    (row) => ({
      id: row.id,
      trackId: row.track_id,
      title: row.title ?? "Untitled Track",
      published: row.publication_status === "published",
      durationMs: numberOrNull(row.duration_ms),
      bpm: numberOrNull(row.bpm),
      format: row.format,
      useCases: row.use_cases ?? [],
      note: row.note,
      playbackStatus: row.playback_status,
      masterPlaybackReady: row.master_playback_ready,
    }),
  );
  const safeEvents: DemandEvent[] = events.rows
    .filter(
      (row) =>
        hasPermission(user.role, "demand.manage") ||
        !row.response_id ||
        responses.some((response) => response.id === row.response_id),
    )
    .map((row) => ({
      id: row.id,
      responseId: row.response_id,
      actorName: hasPermission(user.role, "demand.manage")
        ? row.actor_name
        : null,
      eventType: row.event_type,
      metadata: row.event_metadata ?? {},
      createdAt: iso(row.created_at)!,
    }));
  return {
    ...summary,
    requirements,
    assignees: assignees.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
    })),
    references: mappedReferences,
    responses,
    events: safeEvents,
  };
}

export async function listDemandFormOptions(database: Queryable) {
  const [terms, people] = await Promise.all([
    database.query<
      QueryResultRow & {
        id: string;
        category: string;
        slug: string;
        label: string;
      }
    >(
      `SELECT id,category,slug,label FROM catalog.taxonomy_term WHERE is_active=true ORDER BY CASE category WHEN 'use_case' THEN 0 WHEN 'format' THEN 1 ELSE 2 END,category,label,id`,
    ),
    database.query<QueryResultRow & { id: string; name: string; role: string }>(
      `SELECT person.id,person.name,access.role FROM auth.team_access access JOIN auth."user" person ON person.id=access.auth_user_id WHERE access.status='active' AND access.role IN ('admin','coordinator','music_producer') ORDER BY person.name,person.id`,
    ),
  ]);
  return { terms: terms.rows, people: people.rows };
}

async function validateRelatedInput(
  client: Queryable,
  input: DemandInput,
  opening: boolean,
) {
  const termIds = input.termRequirements.map((term) => term.termId);
  const terms = termIds.length
    ? await client.query<
        QueryResultRow & { id: string; category: string; is_active: boolean }
      >(
        `SELECT id,category,is_active FROM catalog.taxonomy_term WHERE id=ANY($1::uuid[])`,
        [termIds],
      )
    : { rows: [] };
  if (
    terms.rows.length !== new Set(termIds).size ||
    terms.rows.some((term) => !term.is_active)
  )
    throw new DemandRepositoryError(
      "INVALID",
      "Only active controlled taxonomy terms may be newly selected.",
    );
  const categories = new Map(
    terms.rows.map((term) => [term.id, term.category]),
  );
  if (
    opening &&
    (!hasMeaningfulCreativeRequirement(input) ||
      !hasMusicUseCaseOrFormat(input, categories))
  )
    throw new DemandRepositoryError(
      "INVALID",
      "Open music Demands require a meaningful requirement and at least one Use Case or Format.",
    );
  const eligible = await client.query(
    `SELECT person.id FROM auth."user" person JOIN auth.team_access access ON access.auth_user_id=person.id AND access.status='active' WHERE person.id=ANY($1::text[]) AND access.role IN ('admin','coordinator','music_producer')`,
    [[input.ownerUserId, ...input.assigneeUserIds]],
  );
  if (
    eligible.rows.length !==
    new Set([input.ownerUserId, ...input.assigneeUserIds]).size
  )
    throw new DemandRepositoryError(
      "INVALID",
      "Owner and contributors must have active music-work access.",
    );
  if (input.referenceTrackIds.length) {
    const references = await client.query(
      `SELECT id FROM catalog.track WHERE id=ANY($1::uuid[]) AND publication_status='published'`,
      [input.referenceTrackIds],
    );
    if (references.rows.length !== new Set(input.referenceTrackIds).size)
      throw new DemandRepositoryError(
        "INVALID",
        "Only currently published Tracks may be added as references.",
      );
  }
}

async function insertRelations(
  client: Queryable,
  demandId: string,
  input: DemandInput,
  actorId: string,
) {
  for (const requirement of input.termRequirements)
    await client.query(
      `INSERT INTO planning.demand_term_requirement (id,demand_id,term_id,importance,added_by_user_id) VALUES ($1,$2,$3,$4,$5)`,
      [
        randomUUID(),
        demandId,
        requirement.termId,
        requirement.importance,
        actorId,
      ],
    );
  for (const userId of new Set(input.assigneeUserIds))
    await client.query(
      `INSERT INTO planning.demand_assignee (id,demand_id,user_id,added_by_user_id) VALUES ($1,$2,$3,$4)`,
      [randomUUID(), demandId, userId, actorId],
    );
  for (const [sortOrder, trackId] of [
    ...new Set(input.referenceTrackIds),
  ].entries())
    await client.query(
      `INSERT INTO planning.demand_reference_track (id,demand_id,track_id,sort_order,added_by_user_id) VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), demandId, trackId, sortOrder, actorId],
    );
}

const INPUT_VALUES = (input: DemandInput) => [
  input.title,
  input.requesterName ?? null,
  input.requestingTeam ?? null,
  input.projectContext,
  input.brief,
  input.creativeNotes ?? null,
  input.avoidNotes ?? null,
  input.priority,
  input.assetKind,
  input.targetTrackCount,
  input.responseDeadlineOn,
  input.neededByOn,
  input.bpmMin ?? null,
  input.bpmMax ?? null,
  input.durationMinMs ?? null,
  input.durationMaxMs ?? null,
  input.vocalState ?? null,
  input.underDialogue ?? null,
  input.loopable ?? null,
  input.stemsRequired,
  input.endingType ?? null,
  input.ownerUserId,
];

export async function createDemand(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) {
  assertPermission(user, "demand.create");
  const parsed = demandCreateSchema.parse(raw);
  return transaction(pool, async (client) => {
    await validateRelatedInput(client, parsed, parsed.intent === "open");
    const id = randomUUID();
    const status = parsed.intent;
    await client.query(
      `INSERT INTO planning.demand (id,title,requester_name,requesting_team,project_context,brief,creative_notes,avoid_notes,priority,asset_kind,target_track_count,response_deadline_on,needed_by_on,bpm_min,bpm_max,duration_min_ms,duration_max_ms,vocal_state,under_dialogue,loopable,stems_required,ending_type,owner_user_id,created_by_user_id,status,opened_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,CASE WHEN $25='open' THEN now() END)`,
      [id, ...INPUT_VALUES(parsed), user.id, status],
    );
    await insertRelations(client, id, parsed, user.id);
    await client.query(
      `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,'demand_created',$4)`,
      [randomUUID(), id, user.id, { status, briefVersion: 1 }],
    );
    if (status === "open")
      await client.query(
        `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,'demand_opened',$4)`,
        [randomUUID(), id, user.id, { briefVersion: 1 }],
      );
    return id;
  });
}

export async function updateDemand(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) {
  assertPermission(user, "demand.manage");
  const parsed = demandUpdateSchema.parse(raw);
  return transaction(pool, async (client) => {
    const locked = await client.query<LockedDemandRow>(
      `SELECT * FROM planning.demand WHERE id=$1 FOR UPDATE`,
      [parsed.demandId],
    );
    const current = locked.rows[0];
    if (!current)
      throw new DemandRepositoryError("NOT_FOUND", "Demand was not found.");
    if (Number(current.row_version) !== parsed.rowVersion)
      throw new DemandRepositoryError("CONFLICT", DEMAND_CONFLICT_MESSAGE);
    if (current.status === "cancelled")
      throw new DemandRepositoryError(
        "CONFLICT",
        "Cancelled Demands are terminal and cannot be edited.",
      );
    await validateRelatedInput(client, parsed, false);
    const oldTerms = await client.query<
      { term_id: string; importance: string } & QueryResultRow
    >(
      `SELECT term_id,importance FROM planning.demand_term_requirement WHERE demand_id=$1 ORDER BY term_id`,
      [parsed.demandId],
    );
    const oldRefs = await client.query<{ track_id: string } & QueryResultRow>(
      `SELECT track_id FROM planning.demand_reference_track WHERE demand_id=$1 ORDER BY track_id`,
      [parsed.demandId],
    );
    const oldAssignees = await client.query<
      { user_id: string } & QueryResultRow
    >(
      `SELECT user_id FROM planning.demand_assignee WHERE demand_id=$1 ORDER BY user_id`,
      [parsed.demandId],
    );
    const materialScalar = [
      "project_context",
      "brief",
      "creative_notes",
      "avoid_notes",
      "asset_kind",
      "bpm_min",
      "bpm_max",
      "duration_min_ms",
      "duration_max_ms",
      "vocal_state",
      "under_dialogue",
      "loopable",
      "stems_required",
      "ending_type",
      "target_track_count",
    ];
    const mapping: Record<string, unknown> = {
      title: parsed.title,
      project_context: parsed.projectContext,
      brief: parsed.brief,
      creative_notes: parsed.creativeNotes,
      avoid_notes: parsed.avoidNotes,
      asset_kind: parsed.assetKind,
      bpm_min: parsed.bpmMin,
      bpm_max: parsed.bpmMax,
      duration_min_ms: parsed.durationMinMs,
      duration_max_ms: parsed.durationMaxMs,
      vocal_state: parsed.vocalState,
      under_dialogue: parsed.underDialogue,
      loopable: parsed.loopable,
      stems_required: parsed.stemsRequired,
      ending_type: parsed.endingType,
      target_track_count: parsed.targetTrackCount,
    };
    const newTerms = parsed.termRequirements
      .map((term) => `${term.termId}:${term.importance}`)
      .sort();
    const priorTerms = oldTerms.rows
      .map((term) => `${term.term_id}:${term.importance}`)
      .sort();
    const material =
      materialScalar.some(
        (key) => String(current[key] ?? "") !== String(mapping[key] ?? ""),
      ) ||
      JSON.stringify(newTerms) !== JSON.stringify(priorTerms) ||
      JSON.stringify([...new Set(parsed.referenceTrackIds)].sort()) !==
        JSON.stringify(oldRefs.rows.map((row) => row.track_id).sort());
    const versionIncrement = material && current.status !== "draft";
    if (material) {
      const accepted = await client.query(
        `SELECT 1 FROM planning.demand_response WHERE demand_id=$1 AND status='accepted' LIMIT 1`,
        [parsed.demandId],
      );
      if (accepted.rowCount)
        throw new DemandRepositoryError(
          "CONFLICT",
          "Remove the current acceptance before changing the creative brief.",
        );
      if (current.status === "fulfilled")
        throw new DemandRepositoryError(
          "CONFLICT",
          "Reopen the Demand before changing the creative brief.",
        );
    }
    await client.query(
      `UPDATE planning.demand SET title=$2,requester_name=$3,requesting_team=$4,project_context=$5,brief=$6,creative_notes=$7,avoid_notes=$8,priority=$9,asset_kind=$10,target_track_count=$11,response_deadline_on=$12,needed_by_on=$13,bpm_min=$14,bpm_max=$15,duration_min_ms=$16,duration_max_ms=$17,vocal_state=$18,under_dialogue=$19,loopable=$20,stems_required=$21,ending_type=$22,owner_user_id=$23,brief_version=brief_version+CASE WHEN $24 THEN 1 ELSE 0 END,row_version=row_version+1 WHERE id=$1`,
      [parsed.demandId, ...INPUT_VALUES(parsed), versionIncrement],
    );
    await client.query(
      `DELETE FROM planning.demand_term_requirement WHERE demand_id=$1`,
      [parsed.demandId],
    );
    await client.query(
      `DELETE FROM planning.demand_assignee WHERE demand_id=$1`,
      [parsed.demandId],
    );
    await client.query(
      `DELETE FROM planning.demand_reference_track WHERE demand_id=$1`,
      [parsed.demandId],
    );
    await insertRelations(client, parsed.demandId, parsed, user.id);
    const previousAssignees = new Set(
      oldAssignees.rows.map((row) => row.user_id),
    );
    const nextAssignees = new Set(parsed.assigneeUserIds);
    const previousReferences = new Set(oldRefs.rows.map((row) => row.track_id));
    const nextReferences = new Set(parsed.referenceTrackIds);
    for (const assigneeId of nextAssignees)
      if (!previousAssignees.has(assigneeId))
        await client.query(
          `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,'assignee_added',$4)`,
          [randomUUID(), parsed.demandId, user.id, { assigneeId }],
        );
    for (const assigneeId of previousAssignees)
      if (!nextAssignees.has(assigneeId))
        await client.query(
          `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,'assignee_removed',$4)`,
          [randomUUID(), parsed.demandId, user.id, { assigneeId }],
        );
    for (const trackId of nextReferences)
      if (!previousReferences.has(trackId))
        await client.query(
          `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,'reference_added',$4)`,
          [randomUUID(), parsed.demandId, user.id, { trackId }],
        );
    for (const trackId of previousReferences)
      if (!nextReferences.has(trackId))
        await client.query(
          `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,'reference_removed',$4)`,
          [randomUUID(), parsed.demandId, user.id, { trackId }],
        );
    await client.query(
      `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,'demand_updated',$4)`,
      [
        randomUUID(),
        parsed.demandId,
        user.id,
        {
          material,
          fromBriefVersion: Number(current.brief_version),
          toBriefVersion:
            Number(current.brief_version) + (versionIncrement ? 1 : 0),
        },
      ],
    );
    return parsed.demandId;
  });
}

async function fitForTrack(
  database: Queryable,
  demandId: string,
  trackId: string,
): Promise<DemandFitResult> {
  const demandResult = await database.query<DemandFitRow>(
    `SELECT asset_kind,bpm_min,bpm_max,duration_min_ms,duration_max_ms,vocal_state,under_dialogue,loopable,stems_required,ending_type FROM planning.demand WHERE id=$1`,
    [demandId],
  );
  const requirements = await loadTerms(database, demandId);
  const trackResult = await database.query<TrackFitRow>(
    `SELECT track.asset_kind,metadata.bpm,metadata.vocal_state,metadata.under_dialogue,metadata.loopable,metadata.ending_type,
      (SELECT result.duration_ms FROM catalog.audio_asset master JOIN analysis.file_technical_result result ON result.asset_id=master.id WHERE master.track_id=track.id AND master.submission_revision_id=track.published_revision_id AND master.asset_role='master' ORDER BY result.processed_at DESC LIMIT 1) AS duration_ms,
      (SELECT count(*) FROM catalog.audio_asset stem WHERE stem.track_id=track.id AND stem.submission_revision_id=track.published_revision_id AND stem.asset_role='stem') AS stem_count
      FROM catalog.track track LEFT JOIN catalog.track_metadata metadata ON metadata.track_id=track.id WHERE track.id=$1`,
    [trackId],
  );
  const terms = await database.query<{ term_id: string } & QueryResultRow>(
    `SELECT assignment.term_id FROM catalog.track_term_assignment assignment JOIN catalog.taxonomy_term term ON term.id=assignment.term_id AND term.is_active=true WHERE assignment.track_id=$1 AND assignment.review_status='accepted'`,
    [trackId],
  );
  const demand = demandResult.rows[0];
  const track = trackResult.rows[0];
  if (!demand || !track)
    throw new DemandRepositoryError(
      "NOT_FOUND",
      "Demand or Track was not found.",
    );
  return evaluateTrackAgainstDemand(
    {
      assetKind: demand.asset_kind,
      bpmMin: numberOrNull(demand.bpm_min),
      bpmMax: numberOrNull(demand.bpm_max),
      durationMinMs: numberOrNull(demand.duration_min_ms),
      durationMaxMs: numberOrNull(demand.duration_max_ms),
      vocalState: demand.vocal_state,
      underDialogue: demand.under_dialogue,
      loopable: demand.loopable,
      stemsRequired: demand.stems_required,
      endingType: demand.ending_type,
      requirements,
    },
    {
      assetKind: track.asset_kind,
      bpm: numberOrNull(track.bpm),
      durationMs: numberOrNull(track.duration_ms),
      vocalState: track.vocal_state,
      underDialogue: track.under_dialogue,
      loopable: track.loopable,
      stemCount: Number(track.stem_count),
      endingType: track.ending_type,
      acceptedTermIds: terms.rows.map((row) => row.term_id),
    },
  );
}

export function evaluateDemandTrack(
  database: Queryable,
  demandId: string,
  trackId: string,
) {
  return fitForTrack(database, demandId, trackId);
}

async function lockDemand(client: Queryable, demandId: string) {
  const result = await client.query<LockedDemandRow>(
    `SELECT *,CURRENT_DATE AS today FROM planning.demand WHERE id=$1 FOR UPDATE`,
    [demandId],
  );
  if (!result.rows[0])
    throw new DemandRepositoryError("NOT_FOUND", "Demand was not found.");
  return result.rows[0];
}

export async function transitionDemand(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) {
  assertPermission(user, "demand.manage");
  const parsed = demandTransitionSchema.parse(raw);
  return transaction(pool, async (client) => {
    const demand = await lockDemand(client, parsed.demandId);
    if (Number(demand.row_version) !== parsed.rowVersion)
      throw new DemandRepositoryError("CONFLICT", DEMAND_CONFLICT_MESSAGE);
    assertDemandTransition(demand.status, parsed.nextStatus);
    if (
      ["closed", "cancelled"].includes(parsed.nextStatus) &&
      !parsed.reason?.trim()
    )
      throw new DemandRepositoryError("INVALID", "A reason is required.");
    if (
      parsed.nextStatus === "open" &&
      ["closed", "fulfilled"].includes(demand.status) &&
      !parsed.reason?.trim()
    )
      throw new DemandRepositoryError(
        "INVALID",
        "A reopening reason is required.",
      );
    if (parsed.nextStatus === "fulfilled") {
      const accepted = await client.query<
        { track_id: string } & QueryResultRow
      >(
        `SELECT response.track_id FROM planning.demand_response response JOIN catalog.track track ON track.id=response.track_id WHERE response.demand_id=$1 AND response.status='accepted' AND track.publication_status='published' AND track.published_revision_id=response.accepted_published_revision_id ORDER BY response.track_id FOR UPDATE OF response,track`,
        [parsed.demandId],
      );
      let valid = 0;
      for (const response of accepted.rows)
        if (
          (await fitForTrack(client, parsed.demandId, response.track_id))
            .eligibleForAcceptance
        )
          valid += 1;
      if (valid < Number(demand.target_track_count))
        throw new DemandRepositoryError(
          "CONFLICT",
          `Fulfillment requires ${demand.target_track_count} currently valid accepted Tracks.`,
        );
    }
    const event =
      parsed.nextStatus === "open"
        ? demand.status === "draft"
          ? "demand_opened"
          : "demand_reopened"
        : `demand_${parsed.nextStatus}`;
    await client.query(
      `UPDATE planning.demand SET status=$2,status_reason=$3,row_version=row_version+1,opened_at=CASE WHEN $2='open' THEN coalesce(opened_at,now()) ELSE opened_at END,fulfilled_at=CASE WHEN $2='fulfilled' THEN now() WHEN $2='open' THEN NULL ELSE fulfilled_at END,closed_at=CASE WHEN $2='closed' THEN now() WHEN $2='open' THEN NULL ELSE closed_at END,cancelled_at=CASE WHEN $2='cancelled' THEN now() ELSE cancelled_at END WHERE id=$1`,
      [parsed.demandId, parsed.nextStatus, parsed.reason?.trim() || null],
    );
    await client.query(
      `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,$4,$5)`,
      [
        randomUUID(),
        parsed.demandId,
        user.id,
        event,
        {
          from: demand.status,
          to: parsed.nextStatus,
          reason: parsed.reason?.trim() || null,
        },
      ],
    );
    return parsed.demandId;
  });
}

export async function proposeCatalogTrack(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) {
  assertPermission(user, "demand.respond");
  const parsed = demandResponseInputSchema.parse(raw);
  return transaction(pool, async (client) => {
    const demand = await lockDemand(client, parsed.demandId);
    if (
      !responseWindowOpen(
        demand.status,
        date(demand.response_deadline_on),
        date(demand.today),
      )
    )
      throw new DemandRepositoryError(
        "CONFLICT",
        "The response deadline has passed or this Demand is not open.",
      );
    const track = await client.query<
      { published_revision_id: string } & QueryResultRow
    >(
      `SELECT published_revision_id FROM catalog.track WHERE id=$1 AND publication_status='published' AND published_revision_id IS NOT NULL FOR UPDATE`,
      [parsed.trackId],
    );
    if (!track.rows[0])
      throw new DemandRepositoryError(
        "INVALID",
        "Only a currently published Track can be proposed.",
      );
    const id = randomUUID();
    try {
      await client.query(
        `INSERT INTO planning.demand_response (id,demand_id,track_id,origin,status,responder_user_id,pitch_note,brief_version_started,brief_version_submitted,submitted_published_revision_id,submitted_at) VALUES ($1,$2,$3,'catalog','submitted',$4,$5,$6,$6,$7,now())`,
        [
          id,
          parsed.demandId,
          parsed.trackId,
          user.id,
          parsed.pitchNote?.trim() || null,
          demand.brief_version,
          track.rows[0].published_revision_id,
        ],
      );
    } catch (error: unknown) {
      if (isUniqueViolation(error))
        throw new DemandRepositoryError(
          "DUPLICATE",
          "This Track has already been proposed for this Demand.",
        );
      throw error;
    }
    await client.query(
      `INSERT INTO planning.demand_event (id,demand_id,response_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,$4,'response_submitted',$5)`,
      [
        randomUUID(),
        parsed.demandId,
        id,
        user.id,
        {
          origin: "catalog",
          briefVersion: Number(demand.brief_version),
          publishedRevisionId: track.rows[0].published_revision_id,
        },
      ],
    );
    return id;
  });
}

export async function listLinkableSubmissions(
  database: Queryable,
  user: CurrentUser,
  demandId: string,
) {
  assertPermission(user, "demand.respond");
  const manage = hasPermission(user.role, "demand.manage");
  const result = await database.query<
    QueryResultRow & {
      id: string;
      track_id: string;
      title: string;
      status: string;
    }
  >(
    `SELECT submission.id,submission.track_id,coalesce(track.title,'Untitled Track') AS title,submission.status
     FROM workflow.submission submission JOIN catalog.track track ON track.id=submission.track_id
     WHERE ($1::boolean OR submission.owner_user_id=$2)
       AND submission.status NOT IN ('archived','rejected')
       AND NOT EXISTS (SELECT 1 FROM planning.demand_response response WHERE response.demand_id=$3 AND response.track_id=submission.track_id)
     ORDER BY submission.updated_at DESC,submission.id LIMIT 50`,
    [manage, user.id, demandId],
  );
  return result.rows.map((row) => ({
    submissionId: row.id,
    trackId: row.track_id,
    title: row.title,
    status: row.status,
  }));
}

export async function linkExistingSubmission(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) {
  assertPermission(user, "demand.respond");
  const parsed = zLinkExisting.parse(raw);
  return transaction(pool, async (client) => {
    const demand = await lockDemand(client, parsed.demandId);
    if (
      !responseWindowOpen(
        demand.status,
        date(demand.response_deadline_on),
        date(demand.today),
      )
    )
      throw new DemandRepositoryError(
        "CONFLICT",
        "The response deadline has passed or this Demand is not open.",
      );
    const manage = hasPermission(user.role, "demand.manage");
    const submission = await client.query<
      QueryResultRow & { id: string; track_id: string; owner_user_id: string }
    >(
      `SELECT id,track_id,owner_user_id FROM workflow.submission WHERE id=$1 AND status NOT IN ('archived','rejected') FOR UPDATE`,
      [parsed.submissionId],
    );
    const subject = submission.rows[0];
    if (!subject)
      throw new DemandRepositoryError(
        "NOT_FOUND",
        "Submission was not found or is no longer linkable.",
      );
    if (!manage && subject.owner_user_id !== user.id)
      throw new DemandRepositoryError(
        "FORBIDDEN",
        "You may link only your own in-progress Submission.",
      );
    return linkCreatedSubmissionResponse(client, {
      demandId: parsed.demandId,
      trackId: subject.track_id,
      submissionId: subject.id,
      actor: user,
    });
  });
}

const zLinkExisting = demandResponseInputSchema
  .pick({ demandId: true })
  .extend({ submissionId: z.uuid() });

const demandReferenceMutationSchema = z.object({
  demandId: z.uuid(),
  trackId: z.uuid(),
  rowVersion: z.coerce.number().int().positive(),
});

async function lockResponse(
  client: Queryable,
  demandId: string,
  responseId: string,
) {
  const result = await client.query<ResponseRow>(
    `SELECT response.*,track.publication_status,track.published_revision_id FROM planning.demand_response response JOIN catalog.track track ON track.id=response.track_id WHERE response.id=$1 AND response.demand_id=$2 FOR UPDATE OF response,track`,
    [responseId, demandId],
  );
  if (!result.rows[0])
    throw new DemandRepositoryError(
      "NOT_FOUND",
      "Demand response was not found.",
    );
  return result.rows[0];
}

function assertResponseVersion(response: ResponseRow, version: number) {
  if (Number(response.row_version) !== version)
    throw new DemandRepositoryError(
      "CONFLICT",
      "This response changed while you were editing it. Refresh and try again.",
    );
}

export async function submitOrRefreshResponse(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) {
  assertPermission(user, "demand.respond");
  const parsed = responseMutationSchema.parse(raw);
  return transaction(pool, async (client) => {
    const demand = await lockDemand(client, parsed.demandId);
    const response = await lockResponse(
      client,
      parsed.demandId,
      parsed.responseId,
    );
    assertResponseVersion(response, parsed.rowVersion);
    if (!["working", "submitted", "shortlisted"].includes(response.status))
      throw new DemandRepositoryError(
        "CONFLICT",
        "This response cannot be submitted or refreshed in its current state.",
      );
    if (response.responder_user_id !== user.id)
      throw new DemandRepositoryError(
        "FORBIDDEN",
        "You may update only your own response.",
      );
    if (
      !responseWindowOpen(
        demand.status,
        date(demand.response_deadline_on),
        date(demand.today),
      )
    )
      throw new DemandRepositoryError(
        "CONFLICT",
        "The response deadline has passed or this Demand is not open.",
      );
    if (
      response.publication_status !== "published" ||
      !response.published_revision_id
    )
      throw new DemandRepositoryError(
        "INVALID",
        "The Track must be currently published before submission.",
      );
    const event =
      response.status === "working"
        ? "response_submitted"
        : "response_refreshed";
    await client.query(
      `UPDATE planning.demand_response SET status='submitted',brief_version_submitted=$2,submitted_published_revision_id=$3,submitted_at=now(),shortlisted_at=NULL,declined_at=NULL,decline_reason=NULL,row_version=row_version+1 WHERE id=$1`,
      [response.id, demand.brief_version, response.published_revision_id],
    );
    await client.query(
      `INSERT INTO planning.demand_event (id,demand_id,response_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(),
        parsed.demandId,
        response.id,
        user.id,
        event,
        {
          briefVersion: Number(demand.brief_version),
          publishedRevisionId: response.published_revision_id,
        },
      ],
    );
    return response.id;
  });
}

async function coordinatorResponseMutation(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
  kind: "shortlist" | "accept" | "decline" | "restore" | "unaccept",
) {
  assertPermission(user, "demand.manage");
  const parsed = responseMutationSchema.parse(raw);
  return transaction(pool, async (client) => {
    const demand = await lockDemand(client, parsed.demandId);
    const response = await lockResponse(
      client,
      parsed.demandId,
      parsed.responseId,
    );
    assertResponseVersion(response, parsed.rowVersion);
    if (demand.status !== "open")
      throw new DemandRepositoryError(
        "CONFLICT",
        "Reopen the Demand before changing a response decision.",
      );
    let next = response.status;
    let event = "";
    if (kind === "shortlist" && response.status === "submitted") {
      if (
        response.publication_status !== "published" ||
        response.published_revision_id !==
          response.submitted_published_revision_id
      )
        throw new DemandRepositoryError(
          "CONFLICT",
          "Track changed since this response was submitted. Refresh the response first.",
        );
      next = "shortlisted";
      event = "response_shortlisted";
    } else if (
      kind === "decline" &&
      ["submitted", "shortlisted"].includes(response.status)
    ) {
      if (!parsed.reason || parsed.reason.length < 3)
        throw new DemandRepositoryError(
          "INVALID",
          "A short Producer-visible decline reason is required.",
        );
      next = "declined";
      event = "response_declined";
    } else if (kind === "restore" && response.status === "declined") {
      if (
        response.publication_status !== "published" ||
        !response.published_revision_id
      )
        throw new DemandRepositoryError(
          "INVALID",
          "The Track is no longer published.",
        );
      next = "submitted";
      event = "response_restored";
    } else if (kind === "unaccept" && response.status === "accepted") {
      next = "shortlisted";
      event = "response_unaccepted";
    } else if (
      kind === "accept" &&
      ["submitted", "shortlisted"].includes(response.status)
    ) {
      if (
        Number(response.brief_version_submitted) !==
        Number(demand.brief_version)
      )
        throw new DemandRepositoryError(
          "CONFLICT",
          "Brief updated since this Track was submitted. Refresh the response first.",
        );
      if (
        response.publication_status !== "published" ||
        response.published_revision_id !==
          response.submitted_published_revision_id
      )
        throw new DemandRepositoryError(
          "CONFLICT",
          "Track changed since this response was submitted. Refresh the response first.",
        );
      const fit = await fitForTrack(client, parsed.demandId, response.track_id);
      if (!fit.eligibleForAcceptance)
        throw new DemandRepositoryError(
          "FIT_BLOCKED",
          "This Track does not satisfy every Required Demand requirement.",
          fit.requiredMismatches.map(
            (item) =>
              `${item.label}: expected ${item.expected}; ${item.actual}`,
          ),
        );
      next = "accepted";
      event = "response_accepted";
    } else
      throw new DemandRepositoryError(
        "CONFLICT",
        "That response transition is no longer available.",
      );
    await client.query(
      `UPDATE planning.demand_response SET status=$2,row_version=row_version+1,
      shortlisted_at=CASE WHEN $3='shortlist' OR $3='unaccept' THEN now() WHEN $3='restore' THEN NULL ELSE shortlisted_at END,
      declined_at=CASE WHEN $3='decline' THEN now() WHEN $3='restore' THEN NULL ELSE declined_at END,
      decline_reason=CASE WHEN $3='decline' THEN $4 WHEN $3='restore' THEN NULL ELSE decline_reason END,
      brief_version_submitted=CASE WHEN $3='restore' THEN $5 ELSE brief_version_submitted END,
      submitted_published_revision_id=CASE WHEN $3='restore' THEN $6 ELSE submitted_published_revision_id END,
      submitted_at=CASE WHEN $3='restore' THEN now() ELSE submitted_at END,
      accepted_published_revision_id=CASE WHEN $3='accept' THEN $6 WHEN $3='unaccept' THEN NULL ELSE accepted_published_revision_id END,
      accepted_at=CASE WHEN $3='accept' THEN now() WHEN $3='unaccept' THEN NULL ELSE accepted_at END
      WHERE id=$1`,
      [
        response.id,
        next,
        kind,
        parsed.reason?.trim() || null,
        demand.brief_version,
        response.published_revision_id,
      ],
    );
    await client.query(
      `INSERT INTO planning.demand_event (id,demand_id,response_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(),
        parsed.demandId,
        response.id,
        user.id,
        event,
        {
          from: response.status,
          to: next,
          reason: parsed.reason?.trim() || null,
          briefVersion: Number(demand.brief_version),
          publishedRevisionId: response.published_revision_id,
        },
      ],
    );
    return response.id;
  });
}

export const shortlistResponse = (
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) => coordinatorResponseMutation(pool, user, raw, "shortlist");
export const acceptResponse = (pool: Pool, user: CurrentUser, raw: unknown) =>
  coordinatorResponseMutation(pool, user, raw, "accept");
export const declineResponse = (pool: Pool, user: CurrentUser, raw: unknown) =>
  coordinatorResponseMutation(pool, user, raw, "decline");
export const restoreResponse = (pool: Pool, user: CurrentUser, raw: unknown) =>
  coordinatorResponseMutation(pool, user, raw, "restore");
export const unacceptResponse = (pool: Pool, user: CurrentUser, raw: unknown) =>
  coordinatorResponseMutation(pool, user, raw, "unaccept");

async function assertReferenceEditAllowed(
  client: Queryable,
  demand: LockedDemandRow,
  rowVersion: number,
) {
  if (Number(demand.row_version) !== rowVersion)
    throw new DemandRepositoryError("CONFLICT", DEMAND_CONFLICT_MESSAGE);
  if (demand.status === "fulfilled")
    throw new DemandRepositoryError(
      "CONFLICT",
      "Reopen the Demand before changing its reference Tracks.",
    );
  const accepted = await client.query(
    `SELECT 1 FROM planning.demand_response WHERE demand_id=$1 AND status='accepted' LIMIT 1`,
    [demand.id],
  );
  if (accepted.rowCount)
    throw new DemandRepositoryError(
      "CONFLICT",
      "Remove the current acceptance before changing the creative brief.",
    );
}

export async function addDemandReference(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) {
  assertPermission(user, "demand.manage");
  const parsed = demandReferenceMutationSchema.parse(raw);
  return transaction(pool, async (client) => {
    const demand = await lockDemand(client, parsed.demandId);
    await assertReferenceEditAllowed(client, demand, parsed.rowVersion);
    const track = await client.query<{ id: string } & QueryResultRow>(
      `SELECT id FROM catalog.track WHERE id=$1 AND publication_status='published' AND published_revision_id IS NOT NULL`,
      [parsed.trackId],
    );
    if (!track.rowCount)
      throw new DemandRepositoryError(
        "INVALID",
        "Only a currently published Track may be added as a reference.",
      );
    try {
      await client.query(
        `INSERT INTO planning.demand_reference_track (id,demand_id,track_id,sort_order,added_by_user_id)
         VALUES ($1,$2,$3,(SELECT coalesce(max(sort_order),-1)+1 FROM planning.demand_reference_track WHERE demand_id=$2),$4)`,
        [randomUUID(), parsed.demandId, parsed.trackId, user.id],
      );
    } catch (error: unknown) {
      if (isUniqueViolation(error))
        throw new DemandRepositoryError(
          "DUPLICATE",
          "This Track is already a reference for the Demand.",
        );
      throw error;
    }
    await client.query(
      `UPDATE planning.demand SET brief_version=brief_version+CASE WHEN status='draft' THEN 0 ELSE 1 END,row_version=row_version+1 WHERE id=$1`,
      [parsed.demandId],
    );
    await client.query(
      `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,'reference_added',$4)`,
      [randomUUID(), parsed.demandId, user.id, { trackId: parsed.trackId }],
    );
    return parsed.demandId;
  });
}

export async function removeDemandReference(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) {
  assertPermission(user, "demand.manage");
  const parsed = demandReferenceMutationSchema.parse(raw);
  return transaction(pool, async (client) => {
    const demand = await lockDemand(client, parsed.demandId);
    await assertReferenceEditAllowed(client, demand, parsed.rowVersion);
    const removed = await client.query(
      `DELETE FROM planning.demand_reference_track WHERE demand_id=$1 AND track_id=$2`,
      [parsed.demandId, parsed.trackId],
    );
    if (!removed.rowCount)
      throw new DemandRepositoryError(
        "NOT_FOUND",
        "That reference Track is no longer attached.",
      );
    await client.query(
      `UPDATE planning.demand SET brief_version=brief_version+CASE WHEN status='draft' THEN 0 ELSE 1 END,row_version=row_version+1 WHERE id=$1`,
      [parsed.demandId],
    );
    await client.query(
      `INSERT INTO planning.demand_event (id,demand_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,'reference_removed',$4)`,
      [randomUUID(), parsed.demandId, user.id, { trackId: parsed.trackId }],
    );
    return parsed.demandId;
  });
}

export async function withdrawResponse(
  pool: Pool,
  user: CurrentUser,
  raw: unknown,
) {
  assertPermission(user, "demand.respond");
  const parsed = responseMutationSchema.parse(raw);
  return transaction(pool, async (client) => {
    await lockDemand(client, parsed.demandId);
    const response = await lockResponse(
      client,
      parsed.demandId,
      parsed.responseId,
    );
    assertResponseVersion(response, parsed.rowVersion);
    if (response.responder_user_id !== user.id)
      throw new DemandRepositoryError(
        "FORBIDDEN",
        "You may withdraw only your own response.",
      );
    if (!["working", "submitted", "shortlisted"].includes(response.status))
      throw new DemandRepositoryError(
        "CONFLICT",
        "Accepted or completed responses cannot be withdrawn.",
      );
    await client.query(
      `UPDATE planning.demand_response SET status='withdrawn',withdrawn_at=now(),row_version=row_version+1 WHERE id=$1`,
      [response.id],
    );
    await client.query(
      `INSERT INTO planning.demand_event (id,demand_id,response_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,$4,'response_withdrawn',$5)`,
      [
        randomUUID(),
        parsed.demandId,
        response.id,
        user.id,
        { from: response.status },
      ],
    );
    return response.id;
  });
}

export async function getDemandSearchProjection(
  database: Queryable,
  demandId: string,
  user: CurrentUser,
): Promise<DemandSearchProjection | null> {
  const detail = await getDemandDetail(database, demandId, user);
  if (!detail) return null;
  return {
    demandId: detail.id,
    rowVersion: detail.rowVersion,
    displayNumber: detail.displayNumber,
    title: detail.title,
    brief: detail.brief,
    assetKind: detail.assetKind,
    bpmMin: detail.bpmMin,
    bpmMax: detail.bpmMax,
    durationMinMs: detail.durationMinMs,
    durationMaxMs: detail.durationMaxMs,
    vocalState: detail.vocalState,
    underDialogue: detail.underDialogue,
    loopable: detail.loopable,
    stemsRequired: detail.stemsRequired,
    endingType: detail.endingType,
    requiredTerms: detail.requirements.filter(
      (term) => term.importance === "required",
    ),
    preferredTerms: detail.requirements.filter(
      (term) => term.importance === "preferred",
    ),
  };
}

export async function getUploadDemandContext(
  database: Queryable,
  demandId: string,
  user: CurrentUser,
) {
  const projection = await getDemandSearchProjection(database, demandId, user);
  if (!projection) return null;
  return {
    ...projection,
    neededByOn: (await getDemandDetail(database, demandId, user))!.neededByOn,
  };
}

export async function linkCreatedSubmissionResponse(
  client: Queryable,
  input: {
    demandId: string;
    trackId: string;
    submissionId: string;
    actor: CurrentUser;
  },
) {
  assertPermission(input.actor, "demand.respond");
  const demand = await lockDemand(client, input.demandId);
  if (
    !responseWindowOpen(
      demand.status,
      date(demand.response_deadline_on),
      date(demand.today),
    )
  )
    throw new DemandRepositoryError(
      "CONFLICT",
      "The response deadline has passed or this Demand is not open.",
    );
  const id = randomUUID();
  try {
    await client.query(
      `INSERT INTO planning.demand_response (id,demand_id,track_id,submission_id,origin,status,responder_user_id,brief_version_started) VALUES ($1,$2,$3,$4,'submission','working',$5,$6)`,
      [
        id,
        input.demandId,
        input.trackId,
        input.submissionId,
        input.actor.id,
        demand.brief_version,
      ],
    );
  } catch (error: unknown) {
    if (isUniqueViolation(error))
      throw new DemandRepositoryError(
        "DUPLICATE",
        "This Track has already been proposed for this Demand.",
      );
    throw error;
  }
  await client.query(
    `INSERT INTO planning.demand_event (id,demand_id,response_id,actor_user_id,event_type,event_metadata) VALUES ($1,$2,$3,$4,'response_started',$5)`,
    [
      randomUUID(),
      input.demandId,
      id,
      input.actor.id,
      {
        origin: "submission",
        submissionId: input.submissionId,
        briefVersion: Number(demand.brief_version),
      },
    ],
  );
  return id;
}
