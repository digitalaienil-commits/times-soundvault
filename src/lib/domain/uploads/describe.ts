import "server-only";

import type { Pool, QueryResultRow } from "pg";

import { createStorageProviderForKind } from "@/lib/storage/factory";

/**
 * Labels a stored audio object with the Track it belongs to.
 *
 * Storage keys are generated UUIDs so that a producer's filename can never
 * become a path. The cost is that the storage provider, browsed directly,
 * shows nothing but identifiers — unhelpful during an audit, or any time
 * somebody looks at the files without the application in front of them.
 *
 * The labels are provider metadata, never part of the key, so nothing about
 * naming safety changes. Local storage has nowhere to put them and is skipped.
 */
interface DescribeRow extends QueryResultRow {
  storage_backend: "local" | "onedrive";
  storage_key: string;
  provider_drive_id: string | null;
  provider_item_id: string | null;
  file_role: string;
  original_filename: string | null;
  asset_role: "master" | "stem";
  stem_label: string | null;
  stem_type: string | null;
  display_title: string | null;
  track_title: string | null;
  revision_number: number | null;
  owner_name: string | null;
}

function buildLabels(row: DescribeRow): { title: string; details: string } {
  const track = row.track_title ?? row.display_title ?? "Untitled Track";
  const part =
    row.file_role === "preview"
      ? "Preview"
      : row.asset_role === "master"
        ? "Master"
        : (row.stem_label ?? row.stem_type?.replaceAll("_", " ") ?? "Stem");

  const details = [
    part,
    row.revision_number ? `Revision ${row.revision_number}` : null,
    row.owner_name,
    row.original_filename,
  ]
    .filter(Boolean)
    .join(" · ");

  return { title: `${track} — ${part}`, details };
}

/**
 * Returns true when a label was written, false when the backend has nowhere
 * to put one. Never throws for a missing row: labelling is a convenience, and
 * a file with no label is still a correct file.
 */
export async function describeStoredAudio(
  pool: Pool,
  audioFileId: string,
): Promise<boolean> {
  const result = await pool.query<DescribeRow>(
    `SELECT file.storage_backend, file.storage_key, file.file_role,
            file.original_filename,
            COALESCE(session.provider_drive_id, artifact.preview_provider_drive_id) AS provider_drive_id,
            COALESCE(session.provider_item_id, artifact.preview_provider_item_id) AS provider_item_id,
            asset.asset_role, asset.stem_label, asset.stem_type, asset.display_title,
            track.title AS track_title,
            revision.revision_number,
            owner.name AS owner_name
     FROM catalog.audio_file file
     JOIN catalog.audio_asset asset ON asset.id = file.audio_asset_id
     JOIN workflow.submission_revision revision ON revision.id = asset.submission_revision_id
     JOIN workflow.submission submission ON submission.id = revision.submission_id
     LEFT JOIN catalog.track track ON track.id = submission.track_id
     LEFT JOIN auth."user" owner ON owner.id = submission.owner_user_id
     LEFT JOIN workflow.upload_session session ON session.audio_file_id = file.id
     LEFT JOIN media.playback_artifact artifact ON artifact.preview_audio_file_id = file.id
     WHERE file.id = $1 AND file.storage_key IS NOT NULL`,
    [audioFileId],
  );
  const row = result.rows[0];
  if (!row) return false;

  const provider = createStorageProviderForKind(row.storage_backend);
  if (!provider.describeStoredObject) return false;

  const { title, details } = buildLabels(row);
  await provider.describeStoredObject({
    storageKey: row.storage_key,
    providerDriveId: row.provider_drive_id,
    providerItemId: row.provider_item_id,
    title,
    details,
  });
  return true;
}

/**
 * Labels a stored object without letting the attempt affect the caller.
 *
 * An upload that reached storage intact has succeeded. Failing the request
 * because a cosmetic label could not be written would turn a complete upload
 * into a retry, so the failure is reported and swallowed.
 */
export async function describeStoredAudioQuietly(
  pool: Pool,
  audioFileId: string,
): Promise<void> {
  try {
    await describeStoredAudio(pool, audioFileId);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "storage_describe_failed",
        audioFileId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
