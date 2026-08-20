import "server-only";

import { getDatabase } from "@/lib/database/database";

import {
  getTrackAssets,
  getTrackById,
  getTrackCanonicalMetadata,
  listPublishedTracks,
} from "./repository";

export async function getCatalogTrack(trackId: string) {
  return getTrackById(getDatabase(), trackId);
}

export async function getPublishedCatalog() {
  return listPublishedTracks(getDatabase());
}

export async function getCatalogTrackAssets(trackId: string) {
  return getTrackAssets(getDatabase(), trackId);
}

export async function getCatalogTrackMetadata(trackId: string) {
  return getTrackCanonicalMetadata(getDatabase(), trackId);
}
