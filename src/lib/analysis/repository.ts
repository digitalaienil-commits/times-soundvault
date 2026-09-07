import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { ProcessingSourceFile } from "@/lib/processing/repository";
import type { NormalizedAnalysisResult } from "@/types/processing";

import type { LocalMusicFeatures } from "./local-features";
import type { UnifiedAiMetadata } from "./gemini-metadata";

type Queryable = Pick<Pool | PoolClient, "query">;

const SUGGESTION_FIELDS: Array<keyof NormalizedAnalysisResult> = [
  "genres",
  "subgenres",
  "moods",
  "instruments",
  "bpm",
  "bpmRangeAdjusted",
  "key",
  "timeSignature",
  "energy",
  "energyDynamics",
  "valence",
  "arousal",
  "vocalState",
  "voiceTags",
  "voiceoverExists",
  "voiceoverDegree",
  "character",
  "movement",
  "musicalEra",
  "transformerCaption",
  "freeGenreTags",
  "segmentIntervalSeconds",
  "segments",
];

const TERM_FIELD_CATEGORIES: Partial<
  Record<keyof NormalizedAnalysisResult, string>
> = {
  genres: "genre",
  subgenres: "subgenre",
  moods: "mood",
  instruments: "instrument",
  character: "character",
  movement: "movement",
  musicalEra: "era",
};

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function hasSuggestionValue(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function valuesForTaxonomy(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function persistMetadataSuggestions(
  database: Queryable,
  input: {
    trackId: string;
    revisionId: string;
    providerRunId: string;
    normalizedResult: NormalizedAnalysisResult;
  },
): Promise<void> {
  await database.query(
    `DELETE FROM analysis.metadata_suggestion WHERE provider_run_id = $1`,
    [input.providerRunId],
  );

  for (const field of SUGGESTION_FIELDS) {
    const value = input.normalizedResult[field];
    if (!hasSuggestionValue(value)) continue;
    await database.query(
      `INSERT INTO analysis.metadata_suggestion (
         id, track_id, submission_revision_id, provider_run_id,
         field_name, value, confidence
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (provider_run_id, field_name) DO UPDATE
         SET value = EXCLUDED.value, confidence = EXCLUDED.confidence`,
      [
        randomUUID(),
        input.trackId,
        input.revisionId,
        input.providerRunId,
        snakeCase(field),
        JSON.stringify(value),
        0.72,
      ],
    );
  }
}

async function persistKnownTaxonomySuggestions(
  database: Queryable,
  input: {
    trackId: string;
    revisionId: string;
    normalizedResult: NormalizedAnalysisResult;
  },
): Promise<void> {
  for (const [field, category] of Object.entries(
    TERM_FIELD_CATEGORIES,
  ) as Array<[keyof NormalizedAnalysisResult, string]>) {
    for (const label of valuesForTaxonomy(input.normalizedResult[field])) {
      const slug = slugify(label);
      if (!slug) continue;
      const term = await database.query<{ id: string } & QueryResultRow>(
        `SELECT id FROM catalog.taxonomy_term
         WHERE category = $1 AND slug = $2 AND is_active = true
         LIMIT 1`,
        [category, slug],
      );
      const termId = term.rows[0]?.id;
      if (!termId) continue;
      await database.query(
        `INSERT INTO catalog.track_term_assignment (
           id, track_id, term_id, submission_revision_id,
           source_kind, confidence, review_status
         ) VALUES ($1,$2,$3,$4,'ai',$5,'suggested')
         ON CONFLICT (
           track_id, term_id,
           COALESCE(submission_revision_id, '00000000-0000-0000-0000-000000000000'::uuid),
           source_kind
         ) DO UPDATE
           SET confidence = EXCLUDED.confidence,
               review_status = CASE
                 WHEN catalog.track_term_assignment.review_status = 'accepted'
                   THEN 'accepted'
                 ELSE EXCLUDED.review_status
               END`,
        [randomUUID(), input.trackId, termId, input.revisionId, 0.72],
      );
    }
  }
}

export async function persistUnifiedAiMetadata(
  pool: Pool,
  input: {
    source: ProcessingSourceFile;
    features: LocalMusicFeatures;
    metadata: UnifiedAiMetadata;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const providerRunId = randomUUID();
    const externalId = `soundvault-ai:${input.source.submissionRevisionId}`;
    const providerRun = await client.query<{ id: string } & QueryResultRow>(
      `INSERT INTO analysis.provider_run (
         id, submission_revision_id, provider, provider_version,
         provider_track_id, external_id, status, attempt_count,
         input_metadata, raw_result, normalized_result,
         submitted_at, completed_at
       ) VALUES ($1,$2,'ai_metadata',$3,$4,$5,'complete',1,$6,$7,$8,now(),now())
       ON CONFLICT (submission_revision_id, provider) DO UPDATE
         SET provider_version = EXCLUDED.provider_version,
             provider_track_id = EXCLUDED.provider_track_id,
             external_id = EXCLUDED.external_id,
             status = 'complete',
             attempt_count = analysis.provider_run.attempt_count + 1,
             input_metadata = EXCLUDED.input_metadata,
             raw_result = EXCLUDED.raw_result,
             normalized_result = EXCLUDED.normalized_result,
             submitted_at = now(),
             completed_at = now(),
             failed_at = NULL,
             last_error_code = NULL,
             last_error_message = NULL
       RETURNING id`,
      [
        providerRunId,
        input.source.submissionRevisionId,
        input.metadata.providerVersion,
        input.source.trackId,
        externalId,
        JSON.stringify({
          ...input.metadata.inputMetadata,
          localFeatures: input.features,
        }),
        JSON.stringify(input.metadata.rawResult),
        JSON.stringify(input.metadata.normalizedResult),
      ],
    );
    const id = providerRun.rows[0]?.id ?? providerRunId;
    await persistMetadataSuggestions(client, {
      trackId: input.source.trackId,
      revisionId: input.source.submissionRevisionId,
      providerRunId: id,
      normalizedResult: input.metadata.normalizedResult,
    });
    await persistKnownTaxonomySuggestions(client, {
      trackId: input.source.trackId,
      revisionId: input.source.submissionRevisionId,
      normalizedResult: input.metadata.normalizedResult,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
