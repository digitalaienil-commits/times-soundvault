import { ASSET_KINDS, VERSION_TYPES } from "@/types/domain/catalog";
import {
  REVISION_STATUSES,
  SUBMISSION_STATUSES,
} from "@/types/domain/submission";
import type {
  SubmissionDto,
  SubmissionRevisionDto,
} from "@/types/domain/submission";

import {
  DomainRecordError,
  toIsoString,
  toNullableIsoString,
  toNumber,
} from "../record-mapping";

function includes<const Values extends readonly string[]>(
  values: Values,
  value: string,
): value is Values[number] {
  return values.includes(value);
}

export interface SubmissionRow {
  id: string;
  track_id: string;
  batch_id: string | null;
  owner_user_id: string;
  status: string;
  current_revision_id: string | null;
  latest_revision_number: number;
  row_version: number | string;
  title: string | null;
  asset_kind: string;
  version_type: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapSubmissionRow(row: SubmissionRow): SubmissionDto {
  if (
    !includes(SUBMISSION_STATUSES, row.status) ||
    !includes(ASSET_KINDS, row.asset_kind) ||
    !includes(VERSION_TYPES, row.version_type)
  ) {
    throw new DomainRecordError(
      "Submission record contains an invalid domain value",
    );
  }
  return {
    id: row.id,
    trackId: row.track_id,
    batchId: row.batch_id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    currentRevisionId: row.current_revision_id,
    latestRevisionNumber: row.latest_revision_number,
    rowVersion: toNumber(row.row_version),
    title: row.title,
    assetKind: row.asset_kind,
    versionType: row.version_type,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export interface SubmissionRevisionRow {
  id: string;
  submission_id: string;
  revision_number: number;
  created_by_user_id: string;
  revision_status: string;
  producer_metadata: Record<string, unknown>;
  embedded_metadata: Record<string, unknown>;
  source_notes: string | null;
  created_at: Date | string;
  submitted_at: Date | string | null;
}

export function mapSubmissionRevisionRow(
  row: SubmissionRevisionRow,
): SubmissionRevisionDto {
  if (!includes(REVISION_STATUSES, row.revision_status)) {
    throw new DomainRecordError(
      "Submission Revision contains an invalid status",
    );
  }
  return {
    id: row.id,
    submissionId: row.submission_id,
    revisionNumber: row.revision_number,
    createdByUserId: row.created_by_user_id,
    revisionStatus: row.revision_status,
    producerMetadata: row.producer_metadata,
    embeddedMetadata: row.embedded_metadata,
    sourceNotes: row.source_notes,
    createdAt: toIsoString(row.created_at),
    submittedAt: toNullableIsoString(row.submitted_at),
  };
}
