import "server-only";

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import {
  buildCanonicalEmbeddingDocument,
  type CanonicalMetadataInput,
} from "./canonical-input";

type Queryable = Pick<Pool | PoolClient, "query">;

export interface TrackEmbeddingRecord {
  id: string;
  trackId: string;
  publishedRevisionId: string;
  provider: string;
  model: string;
  modelVersion: string;
  dimension: number;
  inputHash: string;
  canonicalText: string;
  status: "queued" | "processing" | "ready" | "stale" | "failed";
  lastError: string | null;
  availableAt: Date;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NearestNeighborItem {
  trackId: string;
  publishedRevisionId: string;
  distance: number;
  similarity: number;
}

export interface EmbeddingStatusSummary {
  publishedTracks: number;
  readyEmbeddings: number;
  queuedEmbeddings: number;
  processingEmbeddings: number;
  staleEmbeddings: number;
  failedEmbeddings: number;
  lastEmbeddedAt: string | null;
}

/**
 * Loads canonical metadata for published tracks to construct embedding documents.
 */
export async function loadCanonicalMetadataForTracks(
  database: Queryable,
  trackIds?: string[],
): Promise<CanonicalMetadataInput[]> {
  const values: unknown[] = [];
  let filterClause =
    "WHERE track.publication_status = 'published' AND track.published_revision_id IS NOT NULL";
  if (trackIds && trackIds.length > 0) {
    values.push(trackIds);
    filterClause += ` AND track.id = ANY($${values.length}::uuid[])`;
  }

  const query = `
    WITH stem_summary AS (
      SELECT track.id AS track_id, count(asset.id)::int AS stem_count
      FROM catalog.track track
      JOIN catalog.audio_asset asset
        ON asset.track_id = track.id
       AND asset.submission_revision_id = track.published_revision_id
       AND asset.asset_role = 'stem'
      ${filterClause}
      GROUP BY track.id
    ),
    accepted_terms AS (
      SELECT assignment.track_id,
             jsonb_agg(
               jsonb_build_object('category', term.category, 'slug', term.slug, 'label', term.label)
               ORDER BY term.category, term.label, term.id
             ) AS terms
      FROM catalog.track_term_assignment assignment
      JOIN catalog.taxonomy_term term
        ON term.id = assignment.term_id
       AND term.is_active = true
      WHERE assignment.review_status = 'accepted'
        ${trackIds && trackIds.length > 0 ? `AND assignment.track_id = ANY($1::uuid[])` : ""}
      GROUP BY assignment.track_id
    )
    SELECT
      track.id AS track_id,
      track.title,
      track.description,
      track.version_type,
      track.version_label,
      track.asset_kind,
      metadata.description_caption,
      metadata.bpm,
      metadata.key_tonic,
      metadata.key_mode,
      metadata.energy_score,
      metadata.vocal_state,
      metadata.language_code,
      metadata.under_dialogue,
      metadata.loopable,
      metadata.ending_type,
      metadata.time_signature,
      metadata.era,
      coalesce(stems.stem_count, 0) AS stem_count,
      coalesce(terms.terms, '[]'::jsonb) AS terms
    FROM catalog.track track
    LEFT JOIN catalog.track_metadata metadata ON metadata.track_id = track.id
    LEFT JOIN stem_summary stems ON stems.track_id = track.id
    LEFT JOIN accepted_terms terms ON terms.track_id = track.id
    ${filterClause}
    ORDER BY track.published_at DESC NULLS LAST, track.id ASC
  `;

  const result = await database.query<QueryResultRow>(query, values);

  return result.rows.map((row) => ({
    trackId: String(row.track_id),
    title: String(row.title),
    versionLabel: row.version_label ? String(row.version_label) : null,
    versionType: row.version_type ? String(row.version_type) : null,
    description: row.description ? String(row.description) : null,
    descriptionCaption: row.description_caption
      ? String(row.description_caption)
      : null,
    assetKind: row.asset_kind ? String(row.asset_kind) : null,
    bpm: row.bpm !== null ? Number(row.bpm) : null,
    keyTonic: row.key_tonic ? String(row.key_tonic) : null,
    keyMode: row.key_mode ? String(row.key_mode) : null,
    energyScore: row.energy_score !== null ? Number(row.energy_score) : null,
    vocalState: row.vocal_state ? String(row.vocal_state) : null,
    languageCode: row.language_code ? String(row.language_code) : null,
    underDialogue:
      row.under_dialogue !== null ? Boolean(row.under_dialogue) : null,
    loopable: row.loopable !== null ? Boolean(row.loopable) : null,
    endingType: row.ending_type ? String(row.ending_type) : null,
    timeSignature: row.time_signature ? String(row.time_signature) : null,
    era: row.era ? String(row.era) : null,
    stemCount: row.stem_count !== null ? Number(row.stem_count) : 0,
    terms: Array.isArray(row.terms) ? row.terms : [],
  }));
}

/**
 * Enqueues missing or stale embeddings for published tracks.
 */
export async function enqueueMissingEmbeddings(
  database: Queryable,
  options: {
    provider: string;
    model: string;
    modelVersion: string;
    dimension: number;
    trackIds?: string[];
  },
): Promise<{ enqueued: number; updated: number }> {
  const metadataList = await loadCanonicalMetadataForTracks(
    database,
    options.trackIds,
  );

  let enqueued = 0;
  let updated = 0;

  for (const metadata of metadataList) {
    const doc = buildCanonicalEmbeddingDocument(metadata);

    // Check if embedding exists and whether input hash matches
    const existingResult = await database.query<
      {
        id: string;
        input_hash: string;
        status: string;
        published_revision_id: string;
      } & QueryResultRow
    >(
      `SELECT id, input_hash, status, published_revision_id
       FROM catalog.track_embedding
       WHERE track_id = $1 AND provider = $2 AND model = $3 AND dimension = $4`,
      [metadata.trackId, options.provider, options.model, options.dimension],
    );

    const existing = existingResult.rows[0];

    // Fetch published revision id
    const revResult = await database.query<
      { published_revision_id: string } & QueryResultRow
    >(`SELECT published_revision_id FROM catalog.track WHERE id = $1`, [
      metadata.trackId,
    ]);
    const publishedRevisionId = revResult.rows[0]?.published_revision_id;
    if (!publishedRevisionId) continue;

    if (!existing) {
      await database.query(
        `INSERT INTO catalog.track_embedding (
           id, track_id, published_revision_id, provider, model, model_version,
           dimension, input_hash, canonical_text, status, available_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', now(), now())`,
        [
          randomUUID(),
          metadata.trackId,
          publishedRevisionId,
          options.provider,
          options.model,
          options.modelVersion,
          options.dimension,
          doc.inputHash,
          doc.canonicalText,
        ],
      );
      enqueued++;
    } else if (
      existing.input_hash !== doc.inputHash ||
      existing.status === "stale" ||
      existing.published_revision_id !== publishedRevisionId
    ) {
      await database.query(
        `UPDATE catalog.track_embedding
         SET published_revision_id = $1,
             model_version = $2,
             input_hash = $3,
             canonical_text = $4,
             status = 'queued',
             available_at = now(),
             lease_owner = NULL,
             lease_expires_at = NULL,
             last_error = NULL,
             updated_at = now()
         WHERE id = $5`,
        [
          publishedRevisionId,
          options.modelVersion,
          doc.inputHash,
          doc.canonicalText,
          existing.id,
        ],
      );
      updated++;
    }
  }

  return { enqueued, updated };
}

/**
 * Claims the next ready/queued embedding job for processing with an atomic lease.
 */
export async function claimNextEmbeddingJob(
  database: Queryable,
  workerId: string,
  leaseMs: number,
  concurrency = 2,
): Promise<TrackEmbeddingRecord | null> {
  const result = await database.query<QueryResultRow>(
    `WITH candidate AS (
       SELECT te.id
       FROM catalog.track_embedding te
       JOIN catalog.track track ON track.id = te.track_id
       WHERE track.publication_status = 'published'
         AND (
           te.status = 'queued'
           OR (te.status = 'processing' AND te.lease_expires_at < now())
         )
         AND te.available_at <= now()
         AND (
           SELECT count(*)
           FROM catalog.track_embedding active
           WHERE active.status = 'processing'
             AND active.lease_owner = $1
             AND active.lease_expires_at >= now()
         ) < $3
       ORDER BY te.available_at ASC, te.created_at ASC
       LIMIT 1
       FOR UPDATE OF te SKIP LOCKED
     )
     UPDATE catalog.track_embedding te
     SET status = 'processing',
         lease_owner = $1,
         lease_expires_at = now() + ($2::text || ' milliseconds')::interval,
         updated_at = now()
     FROM candidate
     WHERE te.id = candidate.id
     RETURNING
       te.id, te.track_id, te.published_revision_id, te.provider, te.model,
       te.model_version, te.dimension, te.input_hash, te.canonical_text,
       te.status, te.last_error, te.available_at, te.lease_owner,
       te.lease_expires_at, te.created_at, te.updated_at`,
    [workerId, leaseMs, concurrency],
  );

  const row = result.rows[0];
  if (!row) return null;

  return mapEmbeddingRow(row);
}

/**
 * Stores the completed embedding vector and marks the record as ready.
 */
export async function completeEmbeddingJob(
  database: Queryable,
  params: {
    id: string;
    workerId: string;
    embedding: number[];
    inputHash: string;
  },
): Promise<boolean> {
  const vectorLiteral = `[${params.embedding.join(",")}]`;
  const result = await database.query(
    `UPDATE catalog.track_embedding
     SET status = 'ready',
         embedding = $1::vector,
         input_hash = $2,
         last_error = NULL,
         lease_owner = NULL,
         lease_expires_at = NULL,
         updated_at = now()
     WHERE id = $3 AND (lease_owner = $4 OR lease_owner IS NULL)`,
    [vectorLiteral, params.inputHash, params.id, params.workerId],
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Marks an embedding job as failed or requeues with backoff.
 */
export async function failEmbeddingJob(
  database: Queryable,
  params: {
    id: string;
    workerId: string;
    error: string;
    retryInMs?: number;
  },
): Promise<void> {
  const retryInMs = params.retryInMs ?? 60_000;
  await database.query(
    `UPDATE catalog.track_embedding
     SET status = 'failed',
         last_error = $1,
         available_at = now() + ($2 || ' milliseconds')::interval,
         lease_owner = NULL,
         lease_expires_at = NULL,
         updated_at = now()
     WHERE id = $3`,
    [params.error.slice(0, 1000), retryInMs, params.id],
  );
}

/**
 * Queries nearest published tracks using cosine distance.
 * Strictly guarantees that ONLY published tracks are returned.
 */
export async function findNearestPublishedTracks(
  database: Queryable,
  params: {
    queryVector: number[];
    provider: string;
    model: string;
    dimension: number;
    limit: number;
    excludeTrackId?: string;
  },
): Promise<NearestNeighborItem[]> {
  const vectorLiteral = `[${params.queryVector.join(",")}]`;
  const values: unknown[] = [
    vectorLiteral,
    params.provider,
    params.model,
    params.dimension,
    params.limit,
  ];

  let excludeClause = "";
  if (params.excludeTrackId) {
    values.push(params.excludeTrackId);
    excludeClause = `AND te.track_id <> $${values.length}::uuid`;
  }

  const result = await database.query<QueryResultRow>(
    `SELECT
       te.track_id,
       te.published_revision_id,
       (te.embedding <=> $1::vector) AS distance,
       (1.0 - (te.embedding <=> $1::vector)) AS similarity
     FROM catalog.track_embedding te
     JOIN catalog.track track
       ON track.id = te.track_id
      AND track.publication_status = 'published'
      AND track.published_revision_id = te.published_revision_id
     WHERE te.status = 'ready'
       AND te.provider = $2
       AND te.model = $3
       AND te.dimension = $4
       AND te.embedding IS NOT NULL
       ${excludeClause}
     ORDER BY te.embedding <=> $1::vector ASC
     LIMIT $5`,
    values,
  );

  return result.rows.map((row) => ({
    trackId: String(row.track_id),
    publishedRevisionId: String(row.published_revision_id),
    distance: Number(row.distance),
    similarity: Math.max(0, Math.min(1, Number(row.similarity))),
  }));
}

/**
 * Retrieves the current ready embedding for a track, if available.
 */
export async function getTrackEmbedding(
  database: Queryable,
  trackId: string,
  provider: string,
  model: string,
  dimension: number,
): Promise<{ id: string; embedding: number[]; inputHash: string } | null> {
  const result = await database.query<
    { id: string; embedding: string; input_hash: string } & QueryResultRow
  >(
    `SELECT te.id, te.embedding::text, te.input_hash
     FROM catalog.track_embedding te
     JOIN catalog.track track
       ON track.id = te.track_id
      AND track.publication_status = 'published'
     WHERE te.track_id = $1
       AND te.provider = $2
       AND te.model = $3
       AND te.dimension = $4
       AND te.status = 'ready'
       AND te.embedding IS NOT NULL
     LIMIT 1`,
    [trackId, provider, model, dimension],
  );

  const row = result.rows[0];
  if (!row || !row.embedding) return null;

  const vector = row.embedding
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((v) => Number(v.trim()));

  return {
    id: row.id,
    embedding: vector,
    inputHash: row.input_hash,
  };
}

/**
 * Gets aggregated status counts of embeddings in SoundVault.
 */
export async function getEmbeddingStatus(
  database: Queryable,
): Promise<EmbeddingStatusSummary> {
  const result = await database.query<
    {
      published_tracks: string;
      ready_count: string;
      queued_count: string;
      processing_count: string;
      stale_count: string;
      failed_count: string;
      last_embedded_at: Date | string | null;
    } & QueryResultRow
  >(
    `SELECT
       (SELECT count(*) FROM catalog.track WHERE publication_status = 'published')::text AS published_tracks,
       count(*) FILTER (WHERE te.status = 'ready')::text AS ready_count,
       count(*) FILTER (WHERE te.status = 'queued')::text AS queued_count,
       count(*) FILTER (WHERE te.status = 'processing')::text AS processing_count,
       count(*) FILTER (WHERE te.status = 'stale')::text AS stale_count,
       count(*) FILTER (WHERE te.status = 'failed')::text AS failed_count,
       max(te.updated_at) FILTER (WHERE te.status = 'ready') AS last_embedded_at
     FROM catalog.track_embedding te`,
  );

  const row = result.rows[0]!;
  return {
    publishedTracks: Number(row.published_tracks),
    readyEmbeddings: Number(row.ready_count),
    queuedEmbeddings: Number(row.queued_count),
    processingEmbeddings: Number(row.processing_count),
    staleEmbeddings: Number(row.stale_count),
    failedEmbeddings: Number(row.failed_count),
    lastEmbeddedAt: row.last_embedded_at
      ? row.last_embedded_at instanceof Date
        ? row.last_embedded_at.toISOString()
        : new Date(row.last_embedded_at).toISOString()
      : null,
  };
}

function mapEmbeddingRow(row: QueryResultRow): TrackEmbeddingRecord {
  return {
    id: String(row.id),
    trackId: String(row.track_id),
    publishedRevisionId: String(row.published_revision_id),
    provider: String(row.provider),
    model: String(row.model),
    modelVersion: String(row.model_version),
    dimension: Number(row.dimension),
    inputHash: String(row.input_hash),
    canonicalText: String(row.canonical_text),
    status: row.status as TrackEmbeddingRecord["status"],
    lastError: row.last_error ? String(row.last_error) : null,
    availableAt: new Date(row.available_at),
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
    leaseExpiresAt: row.lease_expires_at
      ? new Date(row.lease_expires_at)
      : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
