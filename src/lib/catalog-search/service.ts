import "server-only";

import { getDatabase } from "@/lib/database/database";
import type {
  CatalogSearchResult,
  PublishedTrackDetail,
} from "@/types/catalog-search";

import {
  assertKnownTaxonomyFilters,
  getPublishedTrackDetailRow,
  listPublishedCatalogFacets,
  searchPublishedCatalogRows,
} from "./repository";
import {
  parseCatalogSearchParams,
  queryHasPositiveTerm,
  type RawCatalogSearchParams,
} from "./validation";
import { countActiveCatalogFilters } from "./filters";

import { parseEmbeddingConfig } from "@/lib/embeddings/config";
import { createEmbeddingProvider } from "@/lib/embeddings/factory";

export async function searchPublishedCatalog(
  params: RawCatalogSearchParams,
): Promise<CatalogSearchResult> {
  const input = parseCatalogSearchParams(params);
  const hasFilters = countActiveCatalogFilters(input) > 0;
  const facetsPromise = listPublishedCatalogFacets(
    getDatabase(),
    !input.query && !hasFilters,
  );

  await assertKnownTaxonomyFilters(getDatabase(), input);
  if (input.query && !queryHasPositiveTerm(input.query)) {
    return {
      input,
      items: [],
      total: 0,
      pageCount: 0,
      facets: await facetsPromise,
      queryMessage: "Add a word to search for.",
    };
  }

  let searchOptions:
    | {
        queryVector?: number[] | null;
        provider?: string;
        model?: string;
        dimension?: number;
      }
    | undefined;

  const embeddingConfig = parseEmbeddingConfig();
  if (embeddingConfig.semanticSearchEnabled && input.query?.trim()) {
    try {
      const provider = createEmbeddingProvider();
      const queryVector = await provider.embedQuery(input.query);
      searchOptions = {
        queryVector,
        provider: embeddingConfig.provider,
        model: embeddingConfig.model,
        dimension: embeddingConfig.dimension,
      };
    } catch (error) {
      console.warn(
        "Semantic query embedding failed, falling back to lexical search:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const [rows, facets] = await Promise.all([
    searchPublishedCatalogRows(getDatabase(), input, searchOptions),
    facetsPromise,
  ]);
  return {
    input,
    ...rows,
    pageCount: Math.ceil(rows.total / input.pageSize),
    facets,
    queryMessage: null,
  };
}

export function getPublishedTrackDetail(
  trackId: string,
): Promise<PublishedTrackDetail | null> {
  return getPublishedTrackDetailRow(getDatabase(), trackId);
}
