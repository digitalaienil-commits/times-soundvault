import "server-only";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type {
  AudioAssetDto,
  AudioFileDto,
  TrackDto,
} from "@/types/domain/catalog";
import type { TrackMetadataDto } from "@/types/domain/metadata";

import {
  mapAudioAssetRow,
  mapAudioFileRow,
  mapTrackMetadataRow,
  mapTrackRow,
} from "./mapper";
import type {
  AudioAssetRow,
  AudioFileRow,
  TrackMetadataRow,
  TrackRow,
} from "./mapper";

type Queryable = Pick<Pool | PoolClient, "query">;

type TrackQueryRow = TrackRow & QueryResultRow;
type AssetQueryRow = AudioAssetRow & QueryResultRow;
type FileQueryRow = AudioFileRow & QueryResultRow;
type MetadataQueryRow = TrackMetadataRow & QueryResultRow;

export async function getTrackById(
  database: Queryable,
  trackId: string,
): Promise<TrackDto | null> {
  const result = await database.query<TrackQueryRow>(
    `SELECT * FROM catalog.track WHERE id = $1 LIMIT 1`,
    [trackId],
  );
  return result.rows[0] ? mapTrackRow(result.rows[0]) : null;
}

export async function listPublishedTracks(
  database: Queryable,
  limit = 100,
): Promise<TrackDto[]> {
  const result = await database.query<TrackQueryRow>(
    `SELECT *
     FROM catalog.track
     WHERE publication_status = 'published'
     ORDER BY published_at DESC, id
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 250)],
  );
  return result.rows.map(mapTrackRow);
}

export async function getTrackAssets(
  database: Queryable,
  trackId: string,
): Promise<AudioAssetDto[]> {
  const result = await database.query<AssetQueryRow>(
    `SELECT *
     FROM catalog.audio_asset
     WHERE track_id = $1
     ORDER BY sort_order, created_at, id`,
    [trackId],
  );
  return result.rows.map(mapAudioAssetRow);
}

export async function getTrackCanonicalMetadata(
  database: Queryable,
  trackId: string,
): Promise<TrackMetadataDto | null> {
  const result = await database.query<MetadataQueryRow>(
    `SELECT * FROM catalog.track_metadata WHERE track_id = $1 LIMIT 1`,
    [trackId],
  );
  return result.rows[0] ? mapTrackMetadataRow(result.rows[0]) : null;
}

export async function findAudioFilesByChecksum(
  database: Queryable,
  checksumSha256: string,
): Promise<AudioFileDto[]> {
  const result = await database.query<FileQueryRow>(
    `SELECT id, audio_asset_id, file_role, original_filename,
            checksum_sha256, technical_status
     FROM catalog.audio_file
     WHERE checksum_sha256 = $1
     ORDER BY created_at, id`,
    [checksumSha256],
  );
  return result.rows.map(mapAudioFileRow);
}
