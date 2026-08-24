import "server-only";

import type { QueryResultRow } from "pg";

import { getDatabase } from "@/lib/database/database";
import { createStorageProviderForKind } from "@/lib/storage/factory";

export interface ByteRange {
  start: number;
  end: number;
  partial: boolean;
}

export function parseAudioByteRange(
  rangeHeader: string | null,
  byteSize: number,
): ByteRange | null {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) return null;
  if (!rangeHeader) return { start: 0, end: byteSize - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return {
      start: Math.max(0, byteSize - suffix),
      end: byteSize - 1,
      partial: true,
    };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : byteSize - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= byteSize ||
    end < start
  ) {
    return null;
  }
  return { start, end: Math.min(end, byteSize - 1), partial: true };
}

interface ReviewAudioRow extends QueryResultRow {
  storage_backend: "local" | "onedrive";
  storage_key: string;
  provider_drive_id: string | null;
  provider_item_id: string | null;
  byte_size: string;
  content_type: string;
}

export async function openReviewAudio(
  audioFileId: string,
  rangeHeader: string | null,
) {
  const result = await getDatabase().query<ReviewAudioRow>(
    `SELECT file.storage_backend, file.storage_key, upload.provider_drive_id,
            upload.provider_item_id, file.byte_size,
            COALESCE(file.content_type, 'application/octet-stream') AS content_type
     FROM catalog.audio_file file
     LEFT JOIN workflow.upload_session upload ON upload.audio_file_id = file.id
     JOIN catalog.audio_asset asset ON asset.id = file.audio_asset_id
     JOIN workflow.submission_revision revision ON revision.id = asset.submission_revision_id
     JOIN workflow.submission submission ON submission.id = revision.submission_id
       AND submission.current_revision_id = revision.id
     WHERE file.id = $1 AND file.file_role = 'source'
       AND file.technical_status = 'available'
       AND file.storage_backend IN ('local', 'onedrive')
       AND file.storage_key IS NOT NULL AND file.byte_size > 0
       AND submission.status IN ('ready_for_review', 'in_review')`,
    [audioFileId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const byteSize = Number(row.byte_size);
  const range = parseAudioByteRange(rangeHeader, byteSize);
  if (!range) return { invalidRange: true as const, byteSize };
  const provider = createStorageProviderForKind(row.storage_backend);
  const opened = await provider.openStoredObject({
    storageKey: row.storage_key,
    providerDriveId: row.provider_drive_id,
    providerItemId: row.provider_item_id,
    start: range.start,
    end: range.end,
  });
  return {
    invalidRange: false as const,
    body: opened.body,
    byteSize,
    contentType: row.content_type,
    range,
  };
}
