import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, QueryResultRow } from "pg";

import type {
  ProviderAnalysisReference,
  ProviderAnalysisResult,
} from "./provider";
import type { NormalizedAnalysisResult } from "@/types/processing";
import { mapCyaniteTaxonomyLabel } from "./cyanite/taxonomy-map";

export interface CyaniteRun {
  id: string;
  trackId: string;
  externalId: string;
  providerTrackId: string | null;
  status: "preparing" | "uploading" | "analyzing" | "complete" | "failed";
}

export async function prepareCyaniteRun(
  pool: Pool,
  input: {
    revisionId: string;
    externalId: string;
    inputMetadata: Record<string, unknown>;
  },
): Promise<CyaniteRun> {
  const result = await pool.query<
    {
      id: string;
      track_id: string;
      external_id: string;
      provider_track_id: string | null;
      status: CyaniteRun["status"];
    } & QueryResultRow
  >(
    `INSERT INTO analysis.provider_run
       (id, submission_revision_id, provider, provider_version, external_id, input_metadata)
     SELECT $1,$2,'cyanite','v7',$3,$4
     FROM analysis.revision_analysis WHERE submission_revision_id = $2
     ON CONFLICT (submission_revision_id, provider) DO UPDATE
       SET input_metadata = EXCLUDED.input_metadata
     RETURNING id,
       (SELECT track_id FROM analysis.revision_analysis WHERE submission_revision_id=$2) AS track_id,
       external_id, provider_track_id, status`,
    [randomUUID(), input.revisionId, input.externalId, input.inputMetadata],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Revision analysis was not prepared");
  return {
    id: row.id,
    trackId: row.track_id,
    externalId: row.external_id,
    providerTrackId: row.provider_track_id,
    status: row.status,
  };
}

export async function markCyaniteAnalyzing(
  pool: Pool,
  runId: string,
  reference: ProviderAnalysisReference,
): Promise<void> {
  await pool.query(
    `UPDATE analysis.provider_run SET status='analyzing', provider_track_id=$2,
       submitted_at=COALESCE(submitted_at,now()), attempt_count=attempt_count+1
     WHERE id=$1`,
    [runId, reference.providerTrackId],
  );
  await pool.query(
    `UPDATE analysis.revision_analysis SET cyanite_status='analyzing', overall_status='waiting_provider', row_version=row_version+1
     WHERE submission_revision_id=(SELECT submission_revision_id FROM analysis.provider_run WHERE id=$1)`,
    [runId],
  );
}

export async function findCyaniteRunByRevision(
  pool: Pool,
  revisionId: string,
): Promise<CyaniteRun | null> {
  const result = await pool.query<
    {
      id: string;
      track_id: string;
      external_id: string;
      provider_track_id: string | null;
      status: CyaniteRun["status"];
    } & QueryResultRow
  >(
    `SELECT run.id, revision.track_id, run.external_id, run.provider_track_id, run.status
     FROM analysis.provider_run run JOIN analysis.revision_analysis revision ON revision.submission_revision_id=run.submission_revision_id
     WHERE run.submission_revision_id=$1 AND run.provider='cyanite'`,
    [revisionId],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        trackId: row.track_id,
        externalId: row.external_id,
        providerTrackId: row.provider_track_id,
        status: row.status,
      }
    : null;
}

function suggestions(
  result: NormalizedAnalysisResult,
): Array<[string, unknown, number | null]> {
  return [
    ["genres", result.genres, null],
    ["subgenres", result.subgenres, null],
    ["moods", result.moods, null],
    ["instruments", result.instruments, null],
    ["bpm", result.bpm, null],
    ["key", result.key, null],
    ["time_signature", result.timeSignature, null],
    ["energy", result.energy, null],
    ["valence", result.valence, null],
    ["arousal", result.arousal, null],
    ["vocal_state", result.vocalState, null],
    ["character", result.character, null],
    ["movement", result.movement, null],
    ["musical_era", result.musicalEra, null],
    ["transformer_caption", result.transformerCaption, null],
    ["free_genre_tags", result.freeGenreTags, null],
  ].filter(
    ([, value]) => value != null && (!Array.isArray(value) || value.length > 0),
  ) as Array<[string, unknown, number | null]>;
}

export async function persistCyaniteResult(
  pool: Pool,
  run: CyaniteRun,
  result: ProviderAnalysisResult,
): Promise<void> {
  if (
    result.status !== "finished" ||
    !result.rawResult ||
    !result.normalizedResult
  )
    throw new Error("Cyanite result is not complete");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE analysis.provider_run SET status='complete', raw_result=$2, normalized_result=$3,
       completed_at=now(), last_error_code=NULL,last_error_message=NULL WHERE id=$1`,
      [run.id, result.rawResult, result.normalizedResult],
    );
    await client.query(
      `DELETE FROM analysis.metadata_suggestion WHERE provider_run_id=$1`,
      [run.id],
    );
    for (const [field, value, confidence] of suggestions(
      result.normalizedResult,
    )) {
      await client.query(
        `INSERT INTO analysis.metadata_suggestion
          (id,track_id,submission_revision_id,provider_run_id,field_name,value,confidence)
         VALUES ($1,$2,(SELECT submission_revision_id FROM analysis.provider_run WHERE id=$3),$3,$4,$5,$6)`,
        [
          randomUUID(),
          run.trackId,
          run.id,
          field,
          JSON.stringify(value),
          confidence,
        ],
      );
    }
    const labels: Array<[string, string]> = [
      ...result.normalizedResult.genres.map(
        (v) => ["genre", v] as [string, string],
      ),
      ...result.normalizedResult.subgenres.map(
        (v) => ["subgenre", v] as [string, string],
      ),
      ...result.normalizedResult.moods.map(
        (v) => ["mood", v] as [string, string],
      ),
      ...result.normalizedResult.instruments.map(
        (v) => ["instrument", v] as [string, string],
      ),
      ...result.normalizedResult.character.map(
        (v) => ["character", v] as [string, string],
      ),
      ...result.normalizedResult.movement.map(
        (v) => ["movement", v] as [string, string],
      ),
    ];
    for (const [, label] of labels) {
      const mapped = mapCyaniteTaxonomyLabel(label);
      if (!mapped) continue;
      await client.query(
        `INSERT INTO catalog.track_term_assignment
          (id,track_id,term_id,submission_revision_id,source_kind,review_status)
         SELECT $1,$2,term.id,provider.submission_revision_id,'ai','suggested'
         FROM catalog.taxonomy_term term, analysis.provider_run provider
         WHERE term.slug=$3 AND term.category=$4 AND term.is_active=true AND provider.id=$5
         ON CONFLICT (
           track_id,term_id,
           COALESCE(submission_revision_id,'00000000-0000-0000-0000-000000000000'::uuid),
           source_kind
         ) DO NOTHING`,
        [randomUUID(), run.trackId, mapped.slug, mapped.category, run.id],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function failCyaniteRun(
  pool: Pool,
  revisionId: string,
  code: string,
  message: string,
): Promise<void> {
  await pool.query(
    `UPDATE analysis.provider_run SET status='failed',failed_at=now(),last_error_code=$2,last_error_message=$3 WHERE submission_revision_id=$1 AND provider='cyanite'`,
    [revisionId, code.slice(0, 100), message.slice(0, 500)],
  );
}

export async function receiveCyaniteWebhook(
  pool: Pool,
  input: {
    hash: string;
    resourceType: string;
    resourceId: string;
    eventType: string;
    status: "finished" | "failed" | "test";
  },
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO analysis.webhook_event (id,provider,payload_hash,resource_type,resource_id,event_type,event_status)
       VALUES ($1,'cyanite',$2,$3,$4,$5,$6) ON CONFLICT (payload_hash) DO NOTHING RETURNING id`,
      [
        randomUUID(),
        input.hash,
        input.resourceType,
        input.resourceId,
        input.eventType,
        input.status,
      ],
    );
    if (inserted.rowCount === 1 && input.status !== "test") {
      await client.query(
        `INSERT INTO analysis.processing_job (id,job_type,submission_id,submission_revision_id,idempotency_key)
         SELECT $1,'cyanite_result_fetch',submission.id,run.submission_revision_id,$2
         FROM analysis.provider_run run JOIN workflow.submission submission ON submission.current_revision_id=run.submission_revision_id
         WHERE run.provider='cyanite' AND run.provider_track_id=$3
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [randomUUID(), `cyanite:${input.resourceId}:result`, input.resourceId],
      );
    }
    await client.query("COMMIT");
    return inserted.rowCount === 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
