import { UPLOAD_STATUSES } from "@/types/uploads";
import type { UploadSessionDto } from "@/types/uploads";

import {
  DomainRecordError,
  toIsoString,
  toNullableIsoString,
  toNumber,
} from "../record-mapping";

export interface UploadSessionRow {
  id: string;
  audio_file_id: string;
  owner_user_id: string;
  storage_backend: string;
  status: string;
  expected_byte_size: number | string;
  uploaded_byte_size: number | string;
  row_version: number | string;
  last_error_code: string | null;
  last_error_message: string | null;
  provider_expiration: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
  cancelled_at: Date | string | null;
}

export function mapUploadSessionRow(row: UploadSessionRow): UploadSessionDto {
  if (
    (row.storage_backend !== "local" && row.storage_backend !== "onedrive") ||
    !UPLOAD_STATUSES.includes(row.status as UploadSessionDto["status"])
  ) {
    throw new DomainRecordError(
      "Upload Session contains an invalid domain value",
    );
  }
  return {
    id: row.id,
    audioFileId: row.audio_file_id,
    ownerUserId: row.owner_user_id,
    storageBackend: row.storage_backend,
    status: row.status as UploadSessionDto["status"],
    expectedByteSize: toNumber(row.expected_byte_size),
    uploadedByteSize: toNumber(row.uploaded_byte_size),
    rowVersion: toNumber(row.row_version),
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    expiresAt: toNullableIsoString(row.provider_expiration),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    completedAt: toNullableIsoString(row.completed_at),
    cancelledAt: toNullableIsoString(row.cancelled_at),
  };
}
