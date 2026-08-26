import type { AssetKind } from "./domain/catalog";
import type {
  EndingType,
  TaxonomyCategory,
  VocalState,
} from "./domain/metadata";
import type { PlaybackStatus } from "./media";

export const DEMAND_STATUSES = [
  "draft",
  "open",
  "fulfilled",
  "closed",
  "cancelled",
] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number];
export const DEMAND_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type DemandPriority = (typeof DEMAND_PRIORITIES)[number];
export type DemandRequirementImportance = "required" | "preferred";
export type DemandResponseOrigin = "catalog" | "submission";
export const DEMAND_RESPONSE_STATUSES = [
  "working",
  "submitted",
  "shortlisted",
  "accepted",
  "declined",
  "withdrawn",
] as const;
export type DemandResponseStatus = (typeof DEMAND_RESPONSE_STATUSES)[number];

export interface DemandTermRequirement {
  id: string;
  termId: string;
  category: TaxonomyCategory;
  slug: string;
  label: string;
  active: boolean;
  importance: DemandRequirementImportance;
}

export interface DemandCore {
  id: string;
  displayNumber: string;
  title: string;
  requesterName: string | null;
  requestingTeam: string | null;
  projectContext: string;
  brief: string;
  creativeNotes: string | null;
  avoidNotes: string | null;
  priority: DemandPriority;
  status: DemandStatus;
  assetKind: AssetKind;
  targetTrackCount: number;
  responseDeadlineOn: string;
  neededByOn: string;
  bpmMin: number | null;
  bpmMax: number | null;
  durationMinMs: number | null;
  durationMaxMs: number | null;
  vocalState: Exclude<VocalState, "unknown"> | null;
  underDialogue: boolean | null;
  loopable: boolean | null;
  stemsRequired: boolean;
  endingType: Exclude<EndingType, "unknown"> | null;
  ownerUserId: string;
  ownerName: string;
  createdByUserId: string;
  briefVersion: number;
  rowVersion: number;
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemandCoverage {
  working: number;
  submitted: number;
  shortlisted: number;
  accepted: number;
  validAccepted: number;
}

export interface DemandSummary extends DemandCore {
  assignedToCurrentUser: boolean;
  overdue: boolean;
  dueSoon: boolean;
  inProgress: boolean;
  partiallyCovered: boolean;
  readyToFulfill: boolean;
  fulfillmentNeedsAttention: boolean;
  coverage: DemandCoverage;
}

export interface DemandReferenceTrack {
  id: string;
  trackId: string;
  title: string;
  published: boolean;
  durationMs: number | null;
  bpm: number | null;
  format: string | null;
  useCases: string[];
  note: string | null;
  playbackStatus: PlaybackStatus;
  masterPlaybackReady: boolean;
}

export interface DemandResponse {
  id: string;
  demandId: string;
  trackId: string;
  trackTitle: string;
  submissionId: string | null;
  submissionStatus: string | null;
  origin: DemandResponseOrigin;
  status: DemandResponseStatus;
  responderUserId: string;
  responderName: string | null;
  pitchNote: string | null;
  declineReason: string | null;
  briefVersionStarted: number;
  briefVersionSubmitted: number | null;
  submittedPublishedRevisionId: string | null;
  acceptedPublishedRevisionId: string | null;
  currentPublishedRevisionId: string | null;
  currentlyPublished: boolean;
  playbackStatus: PlaybackStatus;
  masterPlaybackReady: boolean;
  rowVersion: number;
  submittedAt: string | null;
  updatedAt: string;
  briefChanged: boolean;
  trackChanged: boolean;
}

export interface DemandEvent {
  id: string;
  responseId: string | null;
  actorName: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DemandDetail extends DemandSummary {
  requirements: DemandTermRequirement[];
  assignees: Array<{ userId: string; name: string }>;
  references: DemandReferenceTrack[];
  responses: DemandResponse[];
  events: DemandEvent[];
}

export interface DemandFitMismatch {
  code: string;
  label: string;
  expected: string;
  actual: string;
}

export interface DemandFitResult {
  eligibleForAcceptance: boolean;
  requiredMatches: string[];
  requiredMismatches: DemandFitMismatch[];
  preferredMatches: string[];
  preferredMissing: string[];
  warnings: string[];
}

export interface DemandListFilters {
  query: string;
  status: DemandStatus | "all";
  priority: DemandPriority | "all";
  ownerUserId: string | "all";
  timing: "all" | "overdue" | "due_soon";
  assignedToMe: boolean;
  myResponse: DemandResponseStatus | "all";
  sort: "priority" | "response_deadline" | "needed_by" | "newest" | "oldest";
  page: number;
  pageSize: number;
}

export interface DemandSearchProjection {
  demandId: string;
  rowVersion: number;
  displayNumber: string;
  title: string;
  brief: string;
  assetKind: AssetKind;
  bpmMin: number | null;
  bpmMax: number | null;
  durationMinMs: number | null;
  durationMaxMs: number | null;
  vocalState: Exclude<VocalState, "unknown"> | null;
  underDialogue: boolean | null;
  loopable: boolean | null;
  stemsRequired: boolean;
  endingType: Exclude<EndingType, "unknown"> | null;
  requiredTerms: DemandTermRequirement[];
  preferredTerms: DemandTermRequirement[];
}

export interface DemandResponseAvailability {
  canStart: boolean;
  reason: string | null;
}
