import type { ReviewChecklistItem, ReviewDecisionPacket } from "./review";

export const PRIMARY_REVIEW_DECISIONS = [
  "approve",
  "request_changes",
  "recommend_reject",
] as const;
export type PrimaryReviewDecision = (typeof PRIMARY_REVIEW_DECISIONS)[number];

export const CHANGE_REQUEST_CATEGORIES = [
  "audio",
  "stems",
  "technical",
  "metadata",
  "rights",
  "copyright",
  "other",
] as const;
export type ChangeRequestCategory = (typeof CHANGE_REQUEST_CATEGORIES)[number];

export interface ChangeRequestItemInput {
  category: ChangeRequestCategory;
  instruction: string;
}

export interface PublicationGateInput {
  canonicalTitle: string | null;
  vocalState: string | null;
  acceptedTerms: Array<{ category: string; label: string }>;
  rights: {
    masterRightsBasis: string;
    compositionRightsBasis: string;
    validUntil: string | null;
  } | null;
  copyright: { status: string; outcome: string | null } | null;
}

export interface PublicationGateResult {
  allowed: boolean;
  blockers: string[];
  checkedAt: string;
  evidence: {
    canonicalTitle: boolean;
    vocalState: boolean;
    formatTerms: number;
    useCaseTerms: number;
    rightsStatus: "ready" | "missing" | "unknown" | "expired";
    copyrightStatus: string;
    copyrightOutcome: string | null;
  };
}

export interface ReviewDecisionResult {
  decisionId: string;
  decisionType: PrimaryReviewDecision | "confirm_reject" | "return_for_changes";
  submissionId: string;
  trackId: string;
  idempotent: boolean;
}

export interface ReviewDecisionView {
  id: string;
  type: PrimaryReviewDecision | "confirm_reject" | "return_for_changes";
  producerSummary: string | null;
  reasonCategory: string | null;
  internalNote: string | null;
  decidedByName: string;
  createdAt: string;
}

export interface ChangeRequestView {
  id: string;
  status: "open" | "resolved" | "superseded";
  producerSummary: string;
  requestedRevisionId: string;
  resolvedByRevisionId: string | null;
  createdAt: string;
  items: Array<ChangeRequestItemInput & { id: string }>;
}

export interface PublicationEventView {
  id: string;
  type: "published" | "withdrawn" | "republished";
  reason: string | null;
  actorName: string;
  createdAt: string;
}

export interface SubmissionDecisionSummary {
  decisions: ReviewDecisionView[];
  changeRequest: ChangeRequestView | null;
  publicationHistory: PublicationEventView[];
  publicationStatus: "unpublished" | "published" | "withdrawn" | "archived";
  publicationGate: PublicationGateResult | null;
  reviewPacket: ReviewDecisionPacket | null;
}

export interface ApprovedPublicationItem {
  submissionId: string;
  revisionId: string;
  trackId: string;
  title: string;
  producerName: string;
  publicationStatus: "unpublished" | "withdrawn";
  gate: PublicationGateResult;
}

export interface DecisionSnapshot {
  reviewVersion: number;
  fields: Record<string, unknown>;
  terms: Array<{
    termId: string;
    category: string;
    label: string;
    sourceKind: string;
  }>;
  checklist: ReviewChecklistItem[];
  rights: Record<string, unknown> | null;
  copyright: Record<string, unknown> | null;
}
