import "server-only";

import { getDatabase } from "@/lib/database/database";
import { parseEmbeddingConfig } from "@/lib/embeddings/config";
import {
  findNearestPublishedTracks,
  getTrackEmbedding,
} from "@/lib/embeddings/repository";
import type { CatalogSearchItem } from "@/types/catalog-search";
import { getPublishedTracksByIds } from "./repository";

export interface SimilarTrackItem extends CatalogSearchItem {
  similarity: number;
}

/**
 * Finds the nearest published canonical tracks to a given published track
 * using cosine similarity of current, ready embeddings.
 *
 * Excludes the source track, unpublished tracks, drafts, and stale embeddings.
 */
export async function findSimilarPublishedTracks(
  trackId: string,
  limit = 4,
): Promise<SimilarTrackItem[]> {
  const database = getDatabase();
  const config = parseEmbeddingConfig();

  // 1. Fetch current ready embedding for source track
  const sourceEmbedding = await getTrackEmbedding(
    database,
    trackId,
    config.provider,
    config.model,
    config.dimension,
  );

  if (!sourceEmbedding || !sourceEmbedding.embedding) {
    return [];
  }

  // 2. Query nearest published neighbors excluding source track
  const neighbors = await findNearestPublishedTracks(database, {
    queryVector: sourceEmbedding.embedding,
    provider: config.provider,
    model: config.model,
    dimension: config.dimension,
    limit,
    excludeTrackId: trackId,
  });

  if (neighbors.length === 0) {
    return [];
  }

  const neighborIds = neighbors.map((n) => n.trackId);
  const similarityMap = new Map(
    neighbors.map((n) => [n.trackId, n.similarity]),
  );

  // 3. Load canonical tracks by exact neighbor IDs
  const publishedItems = await getPublishedTracksByIds(database, neighborIds);

  // Filter and order strictly by neighbor similarity
  const items: SimilarTrackItem[] = [];
  for (const id of neighborIds) {
    const matched = publishedItems.find((item) => item.trackId === id);
    if (matched) {
      items.push({
        ...matched,
        similarity: similarityMap.get(id) ?? 0,
      });
    }
  }

  return items;
}
