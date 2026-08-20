import type { AssetKind, VersionType } from "./catalog";

export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "processing",
  "ready_for_review",
  "in_review",
  "changes_requested",
  "rejection_recommended",
  "approved",
  "rejected",
  "archived",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const REVISION_STATUSES = [
  "draft",
  "submitted",
  "superseded",
  "accepted",
  "rejected",
] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export interface SubmissionDto {
  id: string;
  trackId: string;
  batchId: string | null;
  ownerUserId: string;
  status: SubmissionStatus;
  currentRevisionId: string | null;
  latestRevisionNumber: number;
  rowVersion: number;
  title: string | null;
  assetKind: AssetKind;
  versionType: VersionType;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionRevisionDto {
  id: string;
  submissionId: string;
  revisionNumber: number;
  createdByUserId: string;
  revisionStatus: RevisionStatus;
  producerMetadata: Record<string, unknown>;
  embeddedMetadata: Record<string, unknown>;
  sourceNotes: string | null;
  createdAt: string;
  submittedAt: string | null;
}

export interface CreateDraftSubmissionInput {
  ownerUserId: string;
  actorUserId: string;
  title?: string | null;
  assetKind?: AssetKind;
  parentTrackId?: string | null;
  compositionId?: string | null;
  versionType?: VersionType;
  versionLabel?: string | null;
  batchId?: string | null;
}
