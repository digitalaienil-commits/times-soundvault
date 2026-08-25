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

  const [rows, facets] = await Promise.all([
    searchPublishedCatalogRows(getDatabase(), input),
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
