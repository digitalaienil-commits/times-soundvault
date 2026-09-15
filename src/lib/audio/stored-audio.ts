import "server-only";

import type { QueryResultRow } from "pg";

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

/**
 * The storage columns every source-audio stream needs, whichever query found
 * the row. Authorization belongs to the caller: reaching this point already
 * means the row was selected under a rule that admitted the current user.
 */
export interface StoredAudioRow extends QueryResultRow {
  storage_backend: "local" | "onedrive";
  storage_key: string;
  provider_drive_id: string | null;
  provider_item_id: string | null;
  byte_size: string;
  content_type: string;
}

/** The columns `StoredAudioRow` expects, for reuse across audio queries. */
export const STORED_AUDIO_COLUMNS = `file.storage_backend, file.storage_key,
        upload.provider_drive_id, upload.provider_item_id, file.byte_size,
        COALESCE(file.content_type, 'application/octet-stream') AS content_type`;

/** The conditions that make a source file streamable at all. */
export const STORED_AUDIO_PREDICATE = `file.file_role = 'source'
        AND file.technical_status = 'available'
        AND file.storage_backend IN ('local', 'onedrive')
        AND file.storage_key IS NOT NULL AND file.byte_size > 0`;

export type OpenedStoredAudio =
  | { invalidRange: true; byteSize: number }
  | {
      invalidRange: false;
      body: ReadableStream<Uint8Array>;
      byteSize: number;
      contentType: string;
      range: ByteRange;
    };

export async function openStoredAudioRow(
  row: StoredAudioRow,
  rangeHeader: string | null,
): Promise<OpenedStoredAudio> {
  const byteSize = Number(row.byte_size);
  const range = parseAudioByteRange(rangeHeader, byteSize);
  if (!range) return { invalidRange: true, byteSize };
  const provider = createStorageProviderForKind(row.storage_backend);
  const opened = await provider.openStoredObject({
    storageKey: row.storage_key,
    providerDriveId: row.provider_drive_id,
    providerItemId: row.provider_item_id,
    start: range.start,
    end: range.end,
  });
  return {
    invalidRange: false,
    body: opened.body,
    byteSize,
    contentType: row.content_type,
    range,
  };
}
