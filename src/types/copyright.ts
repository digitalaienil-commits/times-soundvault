export const COPYRIGHT_CHECK_STATUSES = [
  "not_started",
  "awaiting_technical",
  "ready",
  "package_queued",
  "package_building",
  "package_ready",
  "manual_upload_pending",
  "manual_review_pending",
  "completed",
  "failed",
  "cancelled",
] as const;

export type CopyrightCheckStatus = (typeof COPYRIGHT_CHECK_STATUSES)[number];

export const COPYRIGHT_OUTCOMES = [
  "no_claim_observed",
  "third_party_claim_observed",
  "existing_internal_claim",
  "reference_overlap",
  "ownership_conflict",
  "copyright_strike_observed",
  "inconclusive",
  "not_applicable",
] as const;

export type CopyrightOutcome = (typeof COPYRIGHT_OUTCOMES)[number];

export const COPYRIGHT_ELIGIBILITY_STATUSES = [
  "unknown",
  "needs_rights_review",
  "needs_policy_review",
  "potentially_eligible",
  "ineligible",
  "approved_for_future_reference",
] as const;

export type CopyrightEligibilityStatus =
  (typeof COPYRIGHT_ELIGIBILITY_STATUSES)[number];

export const CONTENT_ID_READINESS_STATUSES = [
  "not_assessed",
  "needs_metadata",
  "needs_rights_review",
  "needs_policy_review",
  "ready_for_future_registration",
  "existing_reference",
  "ineligible",
] as const;

export type ContentIdReadinessStatus =
  (typeof CONTENT_ID_READINESS_STATUSES)[number];

export const COPYRIGHT_OBSERVATION_TYPES = [
  "content_id_claim",
  "copyright_strike",
  "ownership_conflict",
  "reference_overlap",
  "existing_internal_reference",
  "no_claim",
  "inconclusive",
] as const;

export type CopyrightObservationType =
  (typeof COPYRIGHT_OBSERVATION_TYPES)[number];

export interface CopyrightCheckListItem {
  id: string;
  submissionId: string;
  submissionRevisionId: string;
  trackId: string;
  title: string;
  ownerName: string;
  revisionNumber: number;
  technicalStatus: string;
  status: CopyrightCheckStatus;
  outcome: CopyrightOutcome | null;
  eligibilityStatus: CopyrightEligibilityStatus;
  readinessStatus: ContentIdReadinessStatus;
  updatedAt: string;
}

export interface CopyrightBatchItemDto {
  id: string;
  copyrightCheckId: string;
  submissionId: string;
  submissionRevisionId: string;
  trackId: string;
  sequence: number;
  title: string;
  sourceSha256: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  observationType: CopyrightObservationType | null;
}

export interface CopyrightBatchDto {
  id: string;
  status: string;
  youtubeVideoId: string | null;
  totalDurationMs: number;
  gapDurationMs: number;
  itemCount: number;
  expiresAt: string | null;
  createdAt: string;
  items: CopyrightBatchItemDto[];
}

export interface CopyrightBatchListItem {
  id: string;
  status: string;
  itemCount: number;
  totalDurationMs: number;
  youtubeVideoId: string | null;
  createdAt: string;
}

export interface CopyrightSummaryDto {
  status: CopyrightCheckStatus;
  outcome: CopyrightOutcome | null;
  eligibilityStatus: CopyrightEligibilityStatus;
  readinessStatus: ContentIdReadinessStatus;
  updatedAt: string;
}
