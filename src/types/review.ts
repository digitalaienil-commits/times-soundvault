import type { MetadataSourceKind, TaxonomyCategory } from "./domain/metadata";

export const REVIEW_CASE_STATUSES = [
  "in_progress",
  "ready_for_decision",
  "superseded",
] as const;
export type ReviewCaseStatus = (typeof REVIEW_CASE_STATUSES)[number];

export const REVIEW_CHECK_CODES = [
  "master_audio",
  "stems",
  "technical_qc",
  "metadata_core",
  "metadata_editorial",
  "rights",
  "copyright",
] as const;
export type ReviewCheckCode = (typeof REVIEW_CHECK_CODES)[number];

export const REVIEW_CHECK_STATUSES = [
  "pending",
  "pass",
  "attention",
  "not_applicable",
] as const;
export type ReviewCheckStatus = (typeof REVIEW_CHECK_STATUSES)[number];

export const REVIEW_FIELD_NAMES = [
  "title",
  "description",
  "bpm",
  "keyTonic",
  "keyMode",
  "timeSignature",
  "energyScore",
  "valence",
  "arousal",
  "vocalState",
  "languageCode",
  "era",
  "descriptionCaption",
  "format",
  "underDialogue",
  "loopable",
  "endingType",
] as const;
export type ReviewFieldName = (typeof REVIEW_FIELD_NAMES)[number];

export interface ReviewFieldDecision {
  value: string | number | boolean | null;
  sourceKind: MetadataSourceKind;
  sourceReference: string | null;
  reviewed: true;
  reviewedByUserId: string;
  reviewedAt: string;
}

export interface ReviewQueueFilters {
  assignment: "unassigned" | "mine" | "all";
  state: "all" | "ready_for_review" | "in_review" | "ready_for_decision";
  technical: "all" | "clean" | "warnings";
  ai: "all" | "complete" | "partial" | "not_configured" | "failed";
  copyright: "all" | "clear" | "attention" | "pending";
  rights: "all" | "reviewed" | "attention";
  search: string;
  page: number;
}

export interface ReviewQueueItem {
  submissionId: string;
  revisionId: string;
  revisionNumber: number;
  trackTitle: string;
  producerName: string;
  submissionStatus: "ready_for_review" | "in_review";
  reviewCaseId: string | null;
  reviewStatus: ReviewCaseStatus | null;
  rowVersion: number | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  technicalState: "clean" | "warnings";
  aiState: "complete" | "partial" | "not_configured" | "failed";
  copyrightState: "clear" | "attention" | "pending";
  rightsState: "reviewed" | "attention";
  waitingSince: string;
}

export interface ReviewQueueResult {
  items: ReviewQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: {
    unassigned: number;
    mine: number;
    inProgress: number;
    readyForDecision: number;
    needsAttention: number;
  };
}

export interface ReviewSourceValues {
  producer: Record<string, unknown>;
  embedded: Record<string, unknown>;
  ai: Record<string, unknown>;
}

export interface ReviewAudioFile {
  id: string;
  assetRole: "master" | "stem";
  label: string;
  contentType: string;
  containerFormat: string | null;
  codec: string | null;
  byteSize: number;
  durationMs: number | null;
  sampleRateHz: number | null;
  bitDepth: number | null;
  channels: number | null;
  channelLayout: string | null;
  bitRateBps: number | null;
  integratedLoudnessLufs: number | null;
  loudnessRangeLu: number | null;
  truePeakDbtp: number | null;
  leadingSilenceMs: number | null;
  trailingSilenceMs: number | null;
}

export interface ReviewQcIssue {
  id: string;
  audioFileId: string | null;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface ReviewTaxonomyTerm {
  id: string;
  category: TaxonomyCategory;
  label: string;
  sourceKind: MetadataSourceKind | null;
  sourceAssignmentId: string | null;
  confidence: number | null;
  decision: "selected" | "rejected" | null;
}

export interface ReviewChecklistItem {
  code: ReviewCheckCode;
  status: ReviewCheckStatus;
  note: string | null;
  reviewedAt: string | null;
}

export interface ReviewNote {
  id: string;
  category: "general" | "audio" | "metadata" | "rights" | "copyright";
  body: string;
  authorName: string;
  createdAt: string;
}

export interface ReviewAggregate {
  submissionId: string;
  revisionId: string;
  revisionNumber: number;
  trackId: string;
  trackTitle: string;
  assetKind: "music" | "sound_effect" | "ambience";
  producerName: string;
  submissionStatus: "ready_for_review" | "in_review";
  reviewCase: null | {
    id: string;
    status: ReviewCaseStatus;
    assignedToUserId: string | null;
    assignedToName: string | null;
    rowVersion: number;
    readyForDecisionAt: string | null;
  };
  editable: boolean;
  sources: ReviewSourceValues;
  draft: Partial<Record<ReviewFieldName, ReviewFieldDecision>>;
  audioFiles: ReviewAudioFile[];
  qcIssues: ReviewQcIssue[];
  taxonomyTerms: ReviewTaxonomyTerm[];
  checklist: ReviewChecklistItem[];
  notes: ReviewNote[];
  rights: Record<string, unknown> | null;
  copyright: Record<string, unknown> | null;
  aiStatus: string;
  eligibleReviewers: {
    id: string;
    name: string;
    role: "admin" | "coordinator";
  }[];
}

export interface ReviewDecisionPacket {
  reviewCaseId: string;
  submissionId: string;
  revisionId: string;
  trackId: string;
  reviewStatus: "ready_for_decision";
  reviewVersion: number;
  coordinatorMetadataDraft: Partial<
    Record<ReviewFieldName, ReviewFieldDecision>
  >;
  terms: Array<{ termId: string; sourceKind: MetadataSourceKind }>;
  checklist: ReviewChecklistItem[];
  attentionItems: ReviewChecklistItem[];
  rightsSummary: Record<string, unknown> | null;
  copyrightSummary: Record<string, unknown> | null;
  lockedAt: string;
}
