import "server-only";

import type { Pool, QueryResultRow } from "pg";

import { getDatabase } from "@/lib/database/database";

type Queryable = Pick<Pool, "query">;

interface DashboardMetricRow extends QueryResultRow {
  total_tracks: string;
  average_ai_confidence: string | null;
  attention_count: string;
  total_duration_ms: string;
  published_tracks: string;
}

export interface DashboardMetricValues {
  totalTracks: number;
  averageAiConfidence: number | null;
  attentionCount: number;
  totalDurationMs: number;
  publishedTracks: number;
}

function parseCount(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Dashboard metric ${field} is invalid`);
  }
  return parsed;
}

export async function readDashboardMetrics(
  database: Queryable,
  ownerUserId: string | null,
): Promise<DashboardMetricValues> {
  const result = await database.query<DashboardMetricRow>(
    `WITH scoped_submissions AS (
       SELECT submission.track_id, submission.status
       FROM workflow.submission submission
       WHERE ($1::text IS NULL OR submission.owner_user_id = $1)
     ),
     scoped_tracks AS (
       SELECT DISTINCT track.id, track.publication_status
       FROM catalog.track track
       JOIN scoped_submissions submission ON submission.track_id = track.id
     ),
     track_durations AS (
       SELECT asset.track_id, MAX(file.duration_ms)::bigint AS duration_ms
       FROM catalog.audio_asset asset
       JOIN catalog.audio_file file ON file.audio_asset_id = asset.id
       JOIN scoped_tracks track ON track.id = asset.track_id
       WHERE asset.asset_role = 'master'
         AND file.file_role = 'source'
         AND file.technical_status = 'available'
         AND file.duration_ms IS NOT NULL
       GROUP BY asset.track_id
     )
     SELECT
       (SELECT COUNT(*) FROM scoped_tracks)::text AS total_tracks,
       (
         SELECT AVG(suggestion.confidence)::text
         FROM analysis.metadata_suggestion suggestion
         JOIN scoped_tracks track ON track.id = suggestion.track_id
         WHERE suggestion.confidence IS NOT NULL
       ) AS average_ai_confidence,
       (
         SELECT COUNT(*)
         FROM scoped_submissions submission
         WHERE ($1::text IS NOT NULL AND submission.status <> 'archived')
            OR ($1::text IS NULL AND submission.status IN (
              'ready_for_review', 'in_review', 'rejection_recommended'
            ))
       )::text AS attention_count,
       (
         SELECT COALESCE(SUM(duration_ms), 0)
         FROM track_durations
       )::text AS total_duration_ms,
       (
         SELECT COUNT(*)
         FROM scoped_tracks track
         WHERE track.publication_status = 'published'
       )::text AS published_tracks`,
    [ownerUserId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Dashboard metrics could not be read");
  }

  const averageAiConfidence =
    row.average_ai_confidence === null
      ? null
      : Number(row.average_ai_confidence);
  if (
    averageAiConfidence !== null &&
    (!Number.isFinite(averageAiConfidence) ||
      averageAiConfidence < 0 ||
      averageAiConfidence > 1)
  ) {
    throw new Error("Dashboard metric average AI confidence is invalid");
  }

  return {
    totalTracks: parseCount(row.total_tracks, "total tracks"),
    averageAiConfidence,
    attentionCount: parseCount(row.attention_count, "attention count"),
    totalDurationMs: parseCount(row.total_duration_ms, "total duration"),
    publishedTracks: parseCount(row.published_tracks, "published tracks"),
  };
}

export function getDashboardMetrics(ownerUserId: string | null) {
  return readDashboardMetrics(getDatabase(), ownerUserId);
}
