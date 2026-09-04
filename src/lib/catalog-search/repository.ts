import "server-only";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import { TAXONOMY_FILTERS } from "./filters";
import { CATALOG_SEARCH_RANKING } from "./ranking";
import type {
  CatalogFacetGroup,
  CatalogSearchInput,
  CatalogSearchItem,
  PublishedTrackDetail,
} from "@/types/catalog-search";
import type { TaxonomyCategory } from "@/types/domain/metadata";
import { parseMediaConfig } from "@/lib/media/config";

type Queryable = Pick<Pool | PoolClient, "query">;

const SORT_SQL = {
  relevance: "relevance DESC, published_at DESC, track_id ASC",
  newest: "published_at DESC, track_id ASC",
  oldest: "published_at ASC, track_id ASC",
  title_asc: "lower(title) ASC, track_id ASC",
  shortest: "duration_ms ASC NULLS LAST, published_at DESC, track_id ASC",
  longest: "duration_ms DESC NULLS LAST, published_at DESC, track_id ASC",
  bpm_asc: "bpm ASC NULLS LAST, published_at DESC, track_id ASC",
  bpm_desc: "bpm DESC NULLS LAST, published_at DESC, track_id ASC",
} as const satisfies Record<CatalogSearchInput["sort"], string>;

const FACET_LABELS: Record<TaxonomyCategory, string> = {
  genre: "Genre",
  subgenre: "Subgenre",
  mood: "Mood",
  instrument: "Instrument",
  theme: "Theme",
  festival: "Festival",
  use_case: "Use Case",
  character: "Character",
  movement: "Movement",
  era: "Era",
  format: "Format",
  geo_genre: "Geo Genre",
  geo_subgenre: "Geo Subgenre",
};

interface SearchRow extends QueryResultRow {
  track_id: string | null;
  published_revision_id: string | null;
  title: string | null;
  description: string | null;
  description_caption: string | null;
  asset_kind: CatalogSearchItem["assetKind"] | null;
  version_type: CatalogSearchItem["versionType"] | null;
  version_label: string | null;
  published_at: Date | string | null;
  duration_ms: number | string | null;
  bpm: number | string | null;
  key_tonic: string | null;
  key_mode: string | null;
  energy_score: number | string | null;
  vocal_state: CatalogSearchItem["vocalState"] | null;
  language_code: string | null;
  under_dialogue: boolean | null;
  loopable: boolean | null;
  ending_type: CatalogSearchItem["endingType"];
  stem_count: number | string | null;
  terms: CatalogSearchItem["terms"] | null;
  relevance: number | string | null;
  total_count: number | string;
  playback_status?: CatalogSearchItem["playbackStatus"];
  master_playback_ready?: boolean;
}

function numberOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function mapSearchRow(row: SearchRow): CatalogSearchItem | null {
  if (
    !row.track_id ||
    !row.published_revision_id ||
    !row.title ||
    !row.asset_kind ||
    !row.version_type ||
    !row.published_at ||
    !row.vocal_state
  ) {
    return null;
  }
  return {
    trackId: row.track_id,
    publishedRevisionId: row.published_revision_id,
    title: row.title,
    description: row.description,
    descriptionCaption: row.description_caption,
    assetKind: row.asset_kind,
    versionType: row.version_type,
    versionLabel: row.version_label,
    publishedAt: toIso(row.published_at),
    durationMs: numberOrNull(row.duration_ms),
    bpm: numberOrNull(row.bpm),
    keyTonic: row.key_tonic,
    keyMode: row.key_mode,
    energyScore: numberOrNull(row.energy_score),
    vocalState: row.vocal_state,
    languageCode: row.language_code,
    underDialogue: row.under_dialogue,
    loopable: row.loopable,
    endingType: row.ending_type,
    stemCount: Number(row.stem_count ?? 0),
    terms: row.terms ?? [],
    relevance: Number(row.relevance ?? 0),
    playbackStatus: row.playback_status ?? "preparing",
    masterPlaybackReady: row.master_playback_ready ?? false,
  };
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function normalizeIdentifier(value: string): string {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
}

export interface SearchSqlOptions {
  queryVector?: number[] | null;
  provider?: string;
  model?: string;
  dimension?: number;
}

function buildSearchSql(input: CatalogSearchInput, options?: SearchSqlOptions) {
  const values: unknown[] = [];
  const bind = (value: unknown, cast = "") => {
    values.push(value);
    return `$${values.length}${cast}`;
  };
  const conditions = [`track.publication_status = 'published'`];
  const normalizedQuery = normalizeSearchText(input.query);
  const normalizedIdentifier = normalizeIdentifier(input.query);
  const queryParameter = bind(input.query, "::text");
  const titleParameter = bind(normalizedQuery, "::text");
  const identifierParameter = bind(normalizedIdentifier, "::text");

  let vectorParam: string | null = null;
  let providerParam: string | null = null;
  let modelParam: string | null = null;
  let dimensionParam: string | null = null;

  if (options?.queryVector && options.queryVector.length > 0) {
    const vectorLiteral = `[${options.queryVector.join(",")}]`;
    vectorParam = bind(vectorLiteral, "::vector");
    providerParam = bind(options.provider ?? "gemini", "::text");
    modelParam = bind(options.model ?? "gemini-embedding-2", "::text");
    dimensionParam = bind(options.dimension ?? 768, "::int");
  }

  if (input.query) {
    const textMatches = [
      `document.search_vector @@ query_input.query`,
      `document.title_normalized = ${titleParameter}`,
      `document.title_normalized LIKE ${titleParameter} || '%'`,
      `${identifierParameter} = ANY(document.identifier_values)`,
    ];
    if (normalizedQuery.length >= CATALOG_SEARCH_RANKING.trigramMinimumLength) {
      textMatches.push(
        `document.title_normalized LIKE '%' || ${titleParameter} || '%'`,
        `document.title_normalized % ${titleParameter}`,
      );
    }
    if (vectorParam) {
      textMatches.push(
        `(embedding.embedding IS NOT NULL AND (embedding.embedding <=> ${vectorParam}) < ${CATALOG_SEARCH_RANKING.semanticDistanceThreshold})`,
      );
    }
    conditions.push(`(${textMatches.join(" OR ")})`);
  }

  if (input.assetKinds.length)
    conditions.push(
      `track.asset_kind = ANY(${bind(input.assetKinds, "::text[]")})`,
    );
  if (input.versionTypes.length)
    conditions.push(
      `track.version_type = ANY(${bind(input.versionTypes, "::text[]")})`,
    );
  if (input.vocalStates.length)
    conditions.push(
      `metadata.vocal_state = ANY(${bind(input.vocalStates, "::text[]")})`,
    );
  if (input.bpmMin !== null)
    conditions.push(`metadata.bpm >= ${bind(input.bpmMin, "::numeric")}`);
  if (input.bpmMax !== null)
    conditions.push(`metadata.bpm <= ${bind(input.bpmMax, "::numeric")}`);
  if (input.durationMinSeconds !== null)
    conditions.push(
      `master.duration_ms >= ${bind(input.durationMinSeconds * 1000, "::bigint")}`,
    );
  if (input.durationMaxSeconds !== null)
    conditions.push(
      `master.duration_ms <= ${bind(input.durationMaxSeconds * 1000, "::bigint")}`,
    );
  if (input.keyTonic)
    conditions.push(
      `lower(metadata.key_tonic) = lower(${bind(input.keyTonic, "::text")})`,
    );
  if (input.keyMode)
    conditions.push(
      `lower(metadata.key_mode) = ${bind(input.keyMode, "::text")}`,
    );
  if (input.energyMin !== null)
    conditions.push(
      `metadata.energy_score >= ${bind(input.energyMin, "::numeric")}`,
    );
  if (input.energyMax !== null)
    conditions.push(
      `metadata.energy_score <= ${bind(input.energyMax, "::numeric")}`,
    );
  if (input.underDialogue !== null)
    conditions.push(
      `metadata.under_dialogue = ${bind(input.underDialogue, "::boolean")}`,
    );
  if (input.loopable !== null)
    conditions.push(`metadata.loopable = ${bind(input.loopable, "::boolean")}`);
  if (input.endingTypes.length)
    conditions.push(
      `metadata.ending_type = ANY(${bind(input.endingTypes, "::text[]")})`,
    );
  if (input.hasStems !== null)
    conditions.push(
      input.hasStems
        ? `coalesce(stems.stem_count, 0) > 0`
        : `coalesce(stems.stem_count, 0) = 0`,
    );
  if (input.publishedAfter)
    conditions.push(
      `track.published_at >= ${bind(input.publishedAfter, "::date")}`,
    );
  if (input.publishedBefore)
    conditions.push(
      `track.published_at < (${bind(input.publishedBefore, "::date")} + interval '1 day')`,
    );

  for (const filter of TAXONOMY_FILTERS) {
    const selected = input[filter.input];
    if (!Array.isArray(selected) || selected.length === 0) continue;
    const category = bind(filter.category, "::text");
    const slugs = bind(selected, "::text[]");
    conditions.push(`EXISTS (
      SELECT 1
      FROM catalog.track_term_assignment selected_assignment
      JOIN catalog.taxonomy_term selected_term
        ON selected_term.id = selected_assignment.term_id
       AND selected_term.is_active = true
      WHERE selected_assignment.track_id = track.id
        AND selected_assignment.review_status = 'accepted'
        AND selected_term.category = ${category}
        AND selected_term.slug = ANY(${slugs})
    )`);
  }

  const lexicalRelevance = input.query
    ? `(
        CASE WHEN document.title_normalized = ${titleParameter} THEN ${CATALOG_SEARCH_RANKING.exactTitle} ELSE 0 END
        + CASE WHEN ${identifierParameter} = ANY(document.identifier_values) THEN ${CATALOG_SEARCH_RANKING.exactIdentifier} ELSE 0 END
        + CASE WHEN document.title_normalized LIKE ${titleParameter} || '%' THEN ${CATALOG_SEARCH_RANKING.titlePrefix} ELSE 0 END
        + CASE WHEN length(${titleParameter}) >= ${CATALOG_SEARCH_RANKING.trigramMinimumLength}
                    AND document.title_normalized LIKE '%' || ${titleParameter} || '%'
               THEN ${CATALOG_SEARCH_RANKING.titleSubstring} ELSE 0 END
        + ts_rank_cd(document.search_vector, query_input.query) * ${CATALOG_SEARCH_RANKING.coverDensityMultiplier}
        + CASE WHEN length(${titleParameter}) >= ${CATALOG_SEARCH_RANKING.trigramMinimumLength}
               THEN similarity(document.title_normalized, ${titleParameter}) * ${CATALOG_SEARCH_RANKING.titleSimilarityMultiplier}
               ELSE 0 END
      )`
    : "0::real";

  const relevance = vectorParam
    ? `((${lexicalRelevance} * ${CATALOG_SEARCH_RANKING.hybridLexicalWeight}) + (CASE WHEN embedding.embedding IS NOT NULL THEN (1.0 - (embedding.embedding <=> ${vectorParam})) * 10.0 * ${CATALOG_SEARCH_RANKING.hybridSemanticWeight} ELSE 0.0 END))`
    : lexicalRelevance;

  const effectiveSort =
    input.sort === "relevance" && !input.query ? "newest" : input.sort;
  const limit = bind(input.pageSize, "::int");
  const offset = bind((input.page - 1) * input.pageSize, "::int");
  const mediaProfileVersion = bind(parseMediaConfig().profileVersion, "::int");

  const sql = `
    WITH query_input AS (
      SELECT websearch_to_tsquery('english', ${queryParameter}) AS query,
             ${titleParameter} AS normalized_title,
             ${identifierParameter} AS normalized_identifier
    ),
    master_technical AS (
      SELECT DISTINCT ON (track.id)
             track.id AS track_id, result.duration_ms
      FROM catalog.track track
      JOIN catalog.audio_asset asset
        ON asset.track_id = track.id
       AND asset.submission_revision_id = track.published_revision_id
       AND asset.asset_role = 'master'
      JOIN analysis.file_technical_result result
        ON result.asset_id = asset.id
       AND result.submission_revision_id = track.published_revision_id
      WHERE track.publication_status = 'published'
      ORDER BY track.id, result.processed_at DESC, result.audio_file_id
    ),
    stem_summary AS (
      SELECT track.id AS track_id, count(asset.id)::int AS stem_count
      FROM catalog.track track
      JOIN catalog.audio_asset asset
        ON asset.track_id = track.id
       AND asset.submission_revision_id = track.published_revision_id
       AND asset.asset_role = 'stem'
      WHERE track.publication_status = 'published'
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
      GROUP BY assignment.track_id
    ),
    playback_summary AS (
      SELECT track.id AS track_id,
             CASE
               WHEN count(asset.id) FILTER (WHERE artifact.status='ready') = count(asset.id)
                    AND count(asset.id) > 0 THEN 'ready'
               WHEN count(asset.id) FILTER (WHERE artifact.status='ready') > 0 THEN 'partial'
               WHEN bool_or(artifact.status='failed') THEN 'failed'
               ELSE 'preparing'
             END AS playback_status,
             bool_or(asset.asset_role='master' AND artifact.status='ready')
               AS master_playback_ready
      FROM catalog.track track
      JOIN catalog.audio_asset asset
        ON asset.track_id=track.id
       AND asset.submission_revision_id=track.published_revision_id
      LEFT JOIN media.playback_artifact artifact
        ON artifact.audio_asset_id=asset.id
       AND artifact.submission_revision_id=track.published_revision_id
       AND artifact.profile_version=${mediaProfileVersion}
      WHERE track.publication_status='published'
      GROUP BY track.id
    ),
    filtered AS (
      SELECT track.id AS track_id,
             track.published_revision_id,
             track.title,
             track.description,
             track.asset_kind,
             track.version_type,
             track.version_label,
             track.published_at,
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
             master.duration_ms,
             coalesce(stems.stem_count, 0) AS stem_count,
             coalesce(accepted_terms.terms, '[]'::jsonb) AS terms,
             coalesce(playback.playback_status,'preparing') AS playback_status,
             coalesce(playback.master_playback_ready,false) AS master_playback_ready,
             ${relevance} AS relevance
      FROM catalog.track track
      JOIN catalog.track_search_document document
        ON document.track_id = track.id
       AND document.published_revision_id = track.published_revision_id
      CROSS JOIN query_input
      LEFT JOIN catalog.track_metadata metadata ON metadata.track_id = track.id
      LEFT JOIN master_technical master ON master.track_id = track.id
      LEFT JOIN stem_summary stems ON stems.track_id = track.id
      LEFT JOIN accepted_terms ON accepted_terms.track_id = track.id
      LEFT JOIN playback_summary playback ON playback.track_id = track.id
      ${
        vectorParam
          ? `LEFT JOIN catalog.track_embedding embedding
               ON embedding.track_id = track.id
              AND embedding.published_revision_id = track.published_revision_id
              AND embedding.status = 'ready'
              AND embedding.provider = ${providerParam}
              AND embedding.model = ${modelParam}
              AND embedding.dimension = ${dimensionParam}
              AND embedding.embedding IS NOT NULL`
          : ""
      }
      WHERE ${conditions.join("\n        AND ")}
    ),
    page AS (
      SELECT filtered.*, count(*) OVER() AS total_count
      FROM filtered
      ORDER BY ${SORT_SQL[effectiveSort]}
      LIMIT ${limit} OFFSET ${offset}
    )
    SELECT * FROM page
    ORDER BY ${SORT_SQL[effectiveSort]}`;

  return {
    sql,
    values,
    countSql: `SELECT count(*)::bigint AS total_count FROM (${sql.replace(/,\n    page AS \([\s\S]*$/, "\n    SELECT * FROM filtered")}) counted`,
    effectiveSort,
  };
}

export async function searchPublishedCatalogRows(
  database: Queryable,
  input: CatalogSearchInput,
  options?: SearchSqlOptions,
): Promise<{ items: CatalogSearchItem[]; total: number }> {
  const query = buildSearchSql(input, options);
  const result = await database.query<SearchRow>(query.sql, query.values);
  let total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
  if (!result.rows.length && input.page > 1) {
    const countValues = query.values.slice(0, -2);
    const count = await database.query<
      { total_count: string } & QueryResultRow
    >(query.countSql, countValues);
    total = Number(count.rows[0]?.total_count ?? 0);
  }
  return {
    items: result.rows.flatMap((row) => {
      const mapped = mapSearchRow(row);
      return mapped ? [mapped] : [];
    }),
    total,
  };
}

export async function getPublishedTracksByIds(
  database: Queryable,
  trackIds: string[],
): Promise<CatalogSearchItem[]> {
  if (!trackIds.length) return [];
  const mediaProfileVersion = parseMediaConfig().profileVersion;
  const result = await database.query<SearchRow>(
    `WITH master_technical AS (
      SELECT DISTINCT ON (track.id)
             track.id AS track_id, result.duration_ms
      FROM catalog.track track
      JOIN catalog.audio_asset asset
        ON asset.track_id = track.id
       AND asset.submission_revision_id = track.published_revision_id
       AND asset.asset_role = 'master'
      JOIN analysis.file_technical_result result
        ON result.asset_id = asset.id
       AND result.submission_revision_id = track.published_revision_id
      WHERE track.publication_status = 'published'
        AND track.id = ANY($1::uuid[])
      ORDER BY track.id, result.processed_at DESC, result.audio_file_id
    ),
    stem_summary AS (
      SELECT track.id AS track_id, count(asset.id)::int AS stem_count
      FROM catalog.track track
      JOIN catalog.audio_asset asset
        ON asset.track_id = track.id
       AND asset.submission_revision_id = track.published_revision_id
       AND asset.asset_role = 'stem'
      WHERE track.publication_status = 'published'
        AND track.id = ANY($1::uuid[])
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
        AND assignment.track_id = ANY($1::uuid[])
      GROUP BY assignment.track_id
    ),
    playback_summary AS (
      SELECT track.id AS track_id,
             CASE
               WHEN count(asset.id) FILTER (WHERE artifact.status='ready') = count(asset.id)
                    AND count(asset.id) > 0 THEN 'ready'
               WHEN count(asset.id) FILTER (WHERE artifact.status='ready') > 0 THEN 'partial'
               WHEN bool_or(artifact.status='failed') THEN 'failed'
               ELSE 'preparing'
             END AS playback_status,
             bool_or(asset.asset_role='master' AND artifact.status='ready')
               AS master_playback_ready
      FROM catalog.track track
      JOIN catalog.audio_asset asset
        ON asset.track_id=track.id
       AND asset.submission_revision_id=track.published_revision_id
      LEFT JOIN media.playback_artifact artifact
        ON artifact.audio_asset_id=asset.id
       AND artifact.submission_revision_id=track.published_revision_id
       AND artifact.profile_version=$2
      WHERE track.publication_status='published'
        AND track.id = ANY($1::uuid[])
      GROUP BY track.id
    )
    SELECT track.id AS track_id,
           track.published_revision_id,
           track.title,
           track.description,
           track.asset_kind,
           track.version_type,
           track.version_label,
           track.published_at,
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
           master.duration_ms,
           coalesce(stems.stem_count, 0) AS stem_count,
           coalesce(accepted_terms.terms, '[]'::jsonb) AS terms,
           coalesce(playback.playback_status,'preparing') AS playback_status,
           coalesce(playback.master_playback_ready,false) AS master_playback_ready,
           0::real AS relevance,
           1::bigint AS total_count
    FROM catalog.track track
    LEFT JOIN catalog.track_metadata metadata ON metadata.track_id = track.id
    LEFT JOIN master_technical master ON master.track_id = track.id
    LEFT JOIN stem_summary stems ON stems.track_id = track.id
    LEFT JOIN accepted_terms ON accepted_terms.track_id = track.id
    LEFT JOIN playback_summary playback ON playback.track_id = track.id
    WHERE track.id = ANY($1::uuid[])
      AND track.publication_status = 'published'`,
    [trackIds, mediaProfileVersion],
  );
  return result.rows
    .map(mapSearchRow)
    .filter((item): item is CatalogSearchItem => item !== null);
}

export async function listPublishedCatalogFacets(
  database: Queryable,
  showCounts: boolean,
): Promise<CatalogFacetGroup[]> {
  const result = await database.query<
    {
      category: TaxonomyCategory;
      slug: string;
      label: string;
      track_count: number | string;
    } & QueryResultRow
  >(
    `SELECT term.category,term.slug,term.label,count(DISTINCT track.id)::int AS track_count
     FROM catalog.taxonomy_term term
     JOIN catalog.track_term_assignment assignment
       ON assignment.term_id=term.id AND assignment.review_status='accepted'
     JOIN catalog.track track
       ON track.id=assignment.track_id AND track.publication_status='published'
     WHERE term.is_active=true
     GROUP BY term.category,term.slug,term.label
     ORDER BY CASE term.category WHEN 'use_case' THEN 0 WHEN 'format' THEN 1 ELSE 2 END,
              term.category,term.label,term.slug`,
  );
  const groups = new Map<TaxonomyCategory, CatalogFacetGroup>();
  for (const row of result.rows) {
    const group = groups.get(row.category) ?? {
      category: row.category,
      label: FACET_LABELS[row.category],
      options: [],
    };
    group.options.push({
      slug: row.slug,
      label: row.label,
      count: showCounts ? Number(row.track_count) : null,
    });
    groups.set(row.category, group);
  }
  return [...groups.values()];
}

export async function assertKnownTaxonomyFilters(
  database: Queryable,
  input: CatalogSearchInput,
): Promise<void> {
  const selected = TAXONOMY_FILTERS.flatMap((filter) => {
    const values = input[filter.input];
    return Array.isArray(values)
      ? values.map((slug) => ({ category: filter.category, slug }))
      : [];
  });
  if (!selected.length) return;
  const categories = selected.map((item) => item.category);
  const slugs = selected.map((item) => item.slug);
  const result = await database.query<{ matches: string } & QueryResultRow>(
    `SELECT count(*)::text AS matches
     FROM unnest($1::text[], $2::text[]) AS requested(category,slug)
     JOIN catalog.taxonomy_term term
       ON term.category=requested.category
      AND term.slug=requested.slug
      AND term.is_active=true`,
    [categories, slugs],
  );
  if (Number(result.rows[0]?.matches ?? 0) !== selected.length) {
    throw new Error("An unknown or inactive taxonomy filter was selected.");
  }
}

interface DetailRow extends SearchRow {
  time_signature: string | null;
  era: string | null;
  valence: number | string | null;
  arousal: number | string | null;
  identifiers: PublishedTrackDetail["identifiers"] | null;
  stems: PublishedTrackDetail["stems"] | null;
  container_format: string | null;
  codec: string | null;
  sample_rate_hz: number | string | null;
  bit_depth: number | string | null;
  channels: number | string | null;
  channel_layout: string | null;
  integrated_loudness_lufs: number | string | null;
  true_peak_dbtp: number | string | null;
}

export async function getPublishedTrackDetailRow(
  database: Queryable,
  trackId: string,
): Promise<PublishedTrackDetail | null> {
  const result = await database.query<DetailRow>(
    `SELECT track.id AS track_id,track.published_revision_id,track.title,track.description,
            track.asset_kind,track.version_type,track.version_label,track.published_at,
            metadata.description_caption,metadata.bpm,metadata.key_tonic,metadata.key_mode,
            metadata.time_signature,metadata.energy_score,metadata.valence,metadata.arousal,
            metadata.vocal_state,metadata.language_code,metadata.era,
            metadata.under_dialogue,metadata.loopable,metadata.ending_type,
            master.duration_ms,master.container_format,master.codec,master.sample_rate_hz,
            master.bit_depth,master.channels,master.channel_layout,
            master.integrated_loudness_lufs,master.true_peak_dbtp,
            coalesce(terms.terms,'[]'::jsonb) AS terms,
            coalesce(stems.stems,'[]'::jsonb) AS stems,
            coalesce(jsonb_array_length(stems.stems),0) AS stem_count,
            coalesce(identifiers.identifiers,'[]'::jsonb) AS identifiers,
            0::real AS relevance,0::bigint AS total_count
     FROM catalog.track track
     JOIN catalog.track_search_document document
       ON document.track_id=track.id
      AND document.published_revision_id=track.published_revision_id
     LEFT JOIN catalog.track_metadata metadata ON metadata.track_id=track.id
     LEFT JOIN LATERAL (
       SELECT technical.duration_ms,technical.container_format,technical.codec,
              technical.sample_rate_hz,technical.bit_depth,technical.channels,
              technical.channel_layout,technical.integrated_loudness_lufs,technical.true_peak_dbtp
       FROM catalog.audio_asset asset
       JOIN analysis.file_technical_result technical
         ON technical.asset_id=asset.id
        AND technical.submission_revision_id=track.published_revision_id
       WHERE asset.track_id=track.id
         AND asset.submission_revision_id=track.published_revision_id
         AND asset.asset_role='master'
       ORDER BY technical.processed_at DESC,technical.audio_file_id
       LIMIT 1
     ) master ON true
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(
                jsonb_build_object('category',term.category,'slug',term.slug,'label',term.label)
                ORDER BY term.category,term.label,term.id
              ) AS terms
       FROM catalog.track_term_assignment assignment
       JOIN catalog.taxonomy_term term ON term.id=assignment.term_id AND term.is_active=true
       WHERE assignment.track_id=track.id AND assignment.review_status='accepted'
     ) terms ON true
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(
                jsonb_build_object('stemType',asset.stem_type,'label',coalesce(asset.stem_label,asset.display_title))
                ORDER BY asset.sort_order,asset.created_at,asset.id
              ) AS stems
       FROM catalog.audio_asset asset
       WHERE asset.track_id=track.id
         AND asset.submission_revision_id=track.published_revision_id
         AND asset.asset_role='stem'
     ) stems ON true
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(
                jsonb_build_object('type',identifier.identifier_type,'value',identifier.identifier_value)
                ORDER BY identifier.identifier_type,identifier.identifier_value
              ) AS identifiers
       FROM catalog.track_identifier identifier WHERE identifier.track_id=track.id
     ) identifiers ON true
     WHERE track.id=$1 AND track.publication_status='published'
     LIMIT 1`,
    [trackId],
  );
  const row = result.rows[0];
  const base = row ? mapSearchRow(row) : null;
  if (!row || !base) return null;
  return {
    ...base,
    timeSignature: row.time_signature,
    era: row.era,
    valence: numberOrNull(row.valence),
    arousal: numberOrNull(row.arousal),
    identifiers: row.identifiers ?? [],
    stems: row.stems ?? [],
    masterTechnical: {
      durationMs: numberOrNull(row.duration_ms),
      containerFormat: row.container_format,
      codec: row.codec,
      sampleRateHz: numberOrNull(row.sample_rate_hz),
      bitDepth: numberOrNull(row.bit_depth),
      channels: numberOrNull(row.channels),
      channelLayout: row.channel_layout,
      integratedLoudnessLufs: numberOrNull(row.integrated_loudness_lufs),
      truePeakDbtp: numberOrNull(row.true_peak_dbtp),
    },
  };
}

export async function rebuildSearchDocuments(
  database: Queryable,
  dryRun: boolean,
) {
  if (dryRun) {
    const status = await getSearchDocumentStatus(database);
    return { ...status, refreshed: 0, removed: 0, dryRun: true };
  }
  const result = await database.query<
    { refreshed_count: string; removed_count: string } & QueryResultRow
  >(`SELECT * FROM catalog.refresh_track_search_documents(NULL)`);
  const status = await getSearchDocumentStatus(database);
  return {
    ...status,
    refreshed: Number(result.rows[0]?.refreshed_count ?? 0),
    removed: Number(result.rows[0]?.removed_count ?? 0),
    dryRun: false,
  };
}

export async function getSearchDocumentStatus(database: Queryable) {
  const result = await database.query<
    {
      published_tracks: string;
      search_documents: string;
      missing_published_documents: string;
      non_published_documents: string;
      last_indexed_at: Date | string | null;
    } & QueryResultRow
  >(`SELECT
       (SELECT count(*) FROM catalog.track WHERE publication_status='published')::text AS published_tracks,
       (SELECT count(*) FROM catalog.track_search_document)::text AS search_documents,
       (SELECT count(*) FROM catalog.track track
        WHERE track.publication_status='published'
          AND NOT EXISTS (SELECT 1 FROM catalog.track_search_document document WHERE document.track_id=track.id))::text
          AS missing_published_documents,
       (SELECT count(*) FROM catalog.track_search_document document
        JOIN catalog.track track ON track.id=document.track_id
        WHERE track.publication_status<>'published')::text AS non_published_documents,
       (SELECT max(indexed_at) FROM catalog.track_search_document) AS last_indexed_at`);
  const row = result.rows[0]!;
  return {
    publishedTracks: Number(row.published_tracks),
    searchDocuments: Number(row.search_documents),
    missingPublishedDocuments: Number(row.missing_published_documents),
    nonPublishedDocuments: Number(row.non_published_documents),
    lastIndexedAt: row.last_indexed_at ? toIso(row.last_indexed_at) : null,
  };
}
