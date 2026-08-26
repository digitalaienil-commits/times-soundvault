import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDatabase } from "@/lib/database/database";
import { parseMediaConfig } from "./config";
import type {
  PlaybackDescriptor,
  PlaybackSourceDescriptor,
  PlaybackStatus,
} from "@/types/media";

type Queryable = Pick<Pool | PoolClient, "query">;

export async function enqueuePlaybackArtifacts(
  database: Queryable,
  input: {
    trackId: string;
    revisionId: string;
    profileVersion: number;
    maxAttempts: number;
  },
) {
  const sources = await database.query<
    { asset_id: string; source_file_id: string } & QueryResultRow
  >(
    `SELECT asset.id AS asset_id,source.id AS source_file_id
     FROM catalog.audio_asset asset
     JOIN LATERAL (
       SELECT file.id
       FROM catalog.audio_file file
       WHERE file.audio_asset_id=asset.id
         AND file.file_role='source'
         AND file.technical_status='available'
       ORDER BY file.created_at DESC,file.id
       LIMIT 1
     ) source ON true
     WHERE asset.track_id=$1 AND asset.submission_revision_id=$2
     ORDER BY CASE asset.asset_role WHEN 'master' THEN 0 ELSE 1 END,
              asset.sort_order,asset.id`,
    [input.trackId, input.revisionId],
  );
  for (const source of sources.rows) {
    const artifactId = randomUUID();
    const inserted = await database.query<{ id: string } & QueryResultRow>(
      `INSERT INTO media.playback_artifact
         (id,track_id,submission_revision_id,audio_asset_id,
          source_audio_file_id,status,profile_version)
       VALUES ($1,$2,$3,$4,$5,'queued',$6)
       ON CONFLICT (source_audio_file_id,profile_version) DO UPDATE
         SET updated_at=media.playback_artifact.updated_at
       RETURNING id`,
      [
        artifactId,
        input.trackId,
        input.revisionId,
        source.asset_id,
        source.source_file_id,
        input.profileVersion,
      ],
    );
    const resolvedId = inserted.rows[0]?.id ?? artifactId;
    await database.query(
      `INSERT INTO media.delivery_job
         (id,job_type,playback_artifact_id,status,max_attempts)
       SELECT $1,'preview',$2,'queued',$3
       WHERE EXISTS (
         SELECT 1 FROM media.playback_artifact
         WHERE id=$2 AND status IN ('queued','failed')
       )
       ON CONFLICT DO NOTHING`,
      [randomUUID(), resolvedId, input.maxAttempts],
    );
  }
  return sources.rowCount ?? 0;
}

export interface PackageSource {
  audioAssetId: string;
  audioFileId: string;
  role: "master" | "stem";
  stemLabel: string | null;
  stemType: string | null;
  sortOrder: number;
  originalFilename: string;
  storageBackend: "local" | "onedrive";
  storageKey: string;
  providerDriveId: string | null;
  providerItemId: string | null;
  byteSize: number;
  checksumSha256: string;
}

export async function listPublishedPackageSources(
  database: Queryable,
  trackId: string,
  scope: "stems" | "full",
): Promise<{
  trackId: string;
  revisionId: string;
  title: string;
  publishedAt: string;
  sources: PackageSource[];
} | null> {
  const result = await database.query<
    {
      track_id: string;
      revision_id: string;
      title: string;
      published_at: Date | string;
      audio_asset_id: string;
      audio_file_id: string;
      asset_role: "master" | "stem";
      stem_label: string | null;
      stem_type: string | null;
      sort_order: number;
      original_filename: string;
      storage_backend: "local" | "onedrive";
      storage_key: string;
      provider_drive_id: string | null;
      provider_item_id: string | null;
      byte_size: string;
      checksum_sha256: string;
    } & QueryResultRow
  >(
    `SELECT track.id AS track_id,track.published_revision_id AS revision_id,
            track.title,track.published_at,asset.id AS audio_asset_id,
            source.id AS audio_file_id,asset.asset_role,asset.stem_label,
            asset.stem_type,asset.sort_order,source.original_filename,
            source.storage_backend,source.storage_key,
            upload.provider_drive_id,upload.provider_item_id,
            source.byte_size,source.checksum_sha256
     FROM catalog.track track
     JOIN catalog.audio_asset asset
       ON asset.track_id=track.id
      AND asset.submission_revision_id=track.published_revision_id
     JOIN LATERAL (
       SELECT file.*
       FROM catalog.audio_file file
       WHERE file.audio_asset_id=asset.id
         AND file.file_role='source'
         AND file.technical_status='available'
       ORDER BY file.created_at DESC,file.id
       LIMIT 1
     ) source ON true
     LEFT JOIN workflow.upload_session upload ON upload.audio_file_id=source.id
     WHERE track.id=$1 AND track.publication_status='published'
       AND ($2='full' OR asset.asset_role='stem')
       AND source.storage_backend IN ('local','onedrive')
       AND source.storage_key IS NOT NULL
       AND source.byte_size > 0
       AND source.checksum_sha256 IS NOT NULL
     ORDER BY CASE asset.asset_role WHEN 'master' THEN 0 ELSE 1 END,
              asset.sort_order,asset.created_at,asset.id`,
    [trackId, scope],
  );
  const first = result.rows[0];
  if (!first) return null;
  return {
    trackId: first.track_id,
    revisionId: first.revision_id,
    title: first.title,
    publishedAt: new Date(first.published_at).toISOString(),
    sources: result.rows.map((row) => ({
      audioAssetId: row.audio_asset_id,
      audioFileId: row.audio_file_id,
      role: row.asset_role,
      stemLabel: row.stem_label,
      stemType: row.stem_type,
      sortOrder: row.sort_order,
      originalFilename: row.original_filename,
      storageBackend: row.storage_backend,
      storageKey: row.storage_key,
      providerDriveId: row.provider_drive_id,
      providerItemId: row.provider_item_id,
      byteSize: Number(row.byte_size),
      checksumSha256: row.checksum_sha256,
    })),
  };
}

export function packageSourceFingerprint(
  revisionId: string,
  scope: "stems" | "full",
  sources: PackageSource[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        formatVersion: 1,
        revisionId,
        scope,
        files: sources.map((source) => [
          source.audioFileId,
          source.checksumSha256,
          source.role,
          source.sortOrder,
        ]),
      }),
    )
    .digest("hex");
}

interface DescriptorRow extends QueryResultRow {
  track_id: string;
  title: string;
  version_label: string | null;
  audio_asset_id: string;
  asset_role: "master" | "stem";
  stem_type: string | null;
  stem_label: string | null;
  display_title: string | null;
  duration_ms: string | number | null;
  source_format: string | null;
  source_byte_size: string;
  artifact_status: "queued" | "building" | "ready" | "failed" | null;
  waveform_peaks: number[] | null;
}

function playbackStatus(rows: DescriptorRow[]): PlaybackStatus {
  const ready = rows.filter((row) => row.artifact_status === "ready").length;
  if (ready === rows.length && ready > 0) return "ready";
  if (ready > 0) return "partial";
  if (rows.some((row) => row.artifact_status === "failed")) return "failed";
  return "preparing";
}

export async function getPublishedPlaybackDescriptor(
  trackId: string,
  database: Queryable = getDatabase(),
): Promise<PlaybackDescriptor | null> {
  const profileVersion = parseMediaConfig().profileVersion;
  const result = await database.query<DescriptorRow>(
    `SELECT track.id AS track_id,track.title,track.version_label,
            asset.id AS audio_asset_id,asset.asset_role,asset.stem_type,
            asset.stem_label,asset.display_title,
            coalesce(preview.duration_ms,source.duration_ms) AS duration_ms,
            source.container_format AS source_format,
            source.byte_size AS source_byte_size,
            artifact.status AS artifact_status,artifact.waveform_peaks
     FROM catalog.track track
     JOIN catalog.audio_asset asset
       ON asset.track_id=track.id
      AND asset.submission_revision_id=track.published_revision_id
     JOIN LATERAL (
       SELECT file.id,file.duration_ms,file.container_format,file.byte_size
       FROM catalog.audio_file file
       WHERE file.audio_asset_id=asset.id
         AND file.file_role='source'
         AND file.technical_status='available'
       ORDER BY file.created_at DESC,file.id
       LIMIT 1
     ) source ON true
     LEFT JOIN media.playback_artifact artifact
       ON artifact.audio_asset_id=asset.id
      AND artifact.source_audio_file_id=source.id
      AND artifact.profile_version=$2
     LEFT JOIN catalog.audio_file preview
       ON preview.id=artifact.preview_audio_file_id
      AND preview.file_role='preview'
      AND preview.technical_status='available'
     WHERE track.id=$1
       AND track.publication_status='published'
       AND track.published_revision_id=asset.submission_revision_id
     ORDER BY CASE asset.asset_role WHEN 'master' THEN 0 ELSE 1 END,
              asset.sort_order,asset.created_at,asset.id`,
    [trackId, profileVersion],
  );
  if (!result.rows.length) return null;
  const sources: PlaybackSourceDescriptor[] = result.rows.map((row) => {
    const ready = row.artifact_status === "ready";
    return {
      audioAssetId: row.audio_asset_id,
      kind: row.asset_role,
      label:
        row.asset_role === "master"
          ? "Master"
          : (row.stem_label ??
            row.display_title ??
            row.stem_type?.replaceAll("_", " ") ??
            "Stem"),
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      sourceFormat: row.source_format,
      sourceByteSize: Number(row.source_byte_size),
      ready,
      streamUrl: ready
        ? `/api/library/tracks/${trackId}/audio/${row.audio_asset_id}`
        : null,
      downloadUrl: `/api/library/tracks/${trackId}/downloads/${row.audio_asset_id}`,
      waveformPeaks: ready ? row.waveform_peaks : null,
    };
  });
  return {
    trackId: result.rows[0]!.track_id,
    title: result.rows[0]!.title,
    versionLabel: result.rows[0]!.version_label,
    status: playbackStatus(result.rows),
    masterPlaybackReady: sources.some(
      (source) => source.kind === "master" && source.ready,
    ),
    sources,
  };
}

export interface PublishedMediaObject {
  storageBackend: "local" | "onedrive";
  storageKey: string;
  providerDriveId: string | null;
  providerItemId: string | null;
  byteSize: number;
  contentType: string;
  checksumSha256: string;
  originalFilename: string;
}

export async function getPublishedMediaObject(
  trackId: string,
  audioAssetId: string,
  representation: "preview" | "source",
  database: Queryable = getDatabase(),
): Promise<PublishedMediaObject | null> {
  const profileVersion = parseMediaConfig().profileVersion;
  const result = await database.query<
    {
      storage_backend: "local" | "onedrive";
      storage_key: string;
      provider_drive_id: string | null;
      provider_item_id: string | null;
      byte_size: string;
      content_type: string;
      checksum_sha256: string;
      original_filename: string;
    } & QueryResultRow
  >(
    representation === "preview"
      ? `SELECT preview.storage_backend,preview.storage_key,
                artifact.preview_provider_drive_id AS provider_drive_id,
                artifact.preview_provider_item_id AS provider_item_id,
                preview.byte_size,preview.content_type,preview.checksum_sha256,
                preview.original_filename
         FROM catalog.track track
         JOIN catalog.audio_asset asset
           ON asset.track_id=track.id
          AND asset.submission_revision_id=track.published_revision_id
         JOIN media.playback_artifact artifact
           ON artifact.audio_asset_id=asset.id
          AND artifact.status='ready'
          AND artifact.profile_version=$3
         JOIN catalog.audio_file preview
           ON preview.id=artifact.preview_audio_file_id
          AND preview.file_role='preview'
          AND preview.technical_status='available'
         WHERE track.id=$1 AND asset.id=$2
           AND track.publication_status='published'
           AND preview.storage_backend IN ('local','onedrive')
           AND preview.storage_key IS NOT NULL
           AND preview.byte_size > 0
           AND preview.checksum_sha256 IS NOT NULL
         LIMIT 1`
      : `SELECT source.storage_backend,source.storage_key,
                upload.provider_drive_id,upload.provider_item_id,
                source.byte_size,source.content_type,source.checksum_sha256,
                source.original_filename
         FROM catalog.track track
         JOIN catalog.audio_asset asset
           ON asset.track_id=track.id
          AND asset.submission_revision_id=track.published_revision_id
         JOIN LATERAL (
           SELECT file.*
           FROM catalog.audio_file file
           WHERE file.audio_asset_id=asset.id
             AND file.file_role='source'
             AND file.technical_status='available'
           ORDER BY file.created_at DESC,file.id
           LIMIT 1
         ) source ON true
         LEFT JOIN workflow.upload_session upload ON upload.audio_file_id=source.id
         WHERE track.id=$1 AND asset.id=$2
           AND track.publication_status='published'
           AND source.storage_backend IN ('local','onedrive')
           AND source.storage_key IS NOT NULL
           AND source.byte_size > 0
           AND source.checksum_sha256 IS NOT NULL
         LIMIT 1`,
    representation === "preview"
      ? [trackId, audioAssetId, profileVersion]
      : [trackId, audioAssetId],
  );
  const row = result.rows[0];
  return row
    ? {
        storageBackend: row.storage_backend,
        storageKey: row.storage_key,
        providerDriveId: row.provider_drive_id,
        providerItemId: row.provider_item_id,
        byteSize: Number(row.byte_size),
        contentType: row.content_type || "application/octet-stream",
        checksumSha256: row.checksum_sha256,
        originalFilename: row.original_filename,
      }
    : null;
}

export async function getPublishedPackageObject(
  packageId: string,
  database: Queryable = getDatabase(),
): Promise<
  { kind: "ready"; object: PublishedMediaObject } | { kind: "expired" } | null
> {
  const result = await database.query<
    {
      status: string;
      expires_at: Date | null;
      storage_backend: "local" | "onedrive" | null;
      storage_key: string | null;
      provider_drive_id: string | null;
      provider_item_id: string | null;
      byte_size: string | null;
      checksum_sha256: string | null;
      original_filename: string;
    } & QueryResultRow
  >(
    `SELECT package.status,package.expires_at,package.storage_backend,
            package.storage_key,package.provider_drive_id,package.provider_item_id,
            package.byte_size,package.checksum_sha256,package.original_filename
     FROM media.download_package package
     JOIN catalog.track track
       ON track.id=package.track_id
      AND track.published_revision_id=package.submission_revision_id
     WHERE package.id=$1 AND track.publication_status='published'`,
    [packageId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (
    row.status === "expired" ||
    (row.expires_at && row.expires_at.getTime() <= Date.now())
  ) {
    return { kind: "expired" };
  }
  if (
    row.status !== "ready" ||
    !row.storage_backend ||
    !row.storage_key ||
    !row.byte_size ||
    !row.checksum_sha256
  ) {
    return null;
  }
  return {
    kind: "ready",
    object: {
      storageBackend: row.storage_backend,
      storageKey: row.storage_key,
      providerDriveId: row.provider_drive_id,
      providerItemId: row.provider_item_id,
      byteSize: Number(row.byte_size),
      contentType: "application/zip",
      checksumSha256: row.checksum_sha256,
      originalFilename: row.original_filename,
    },
  };
}
