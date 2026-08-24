import "server-only";

import { getDatabase } from "@/lib/database/database";
import type { CurrentUser } from "@/types/auth";
import type {
  ReviewAggregate,
  ReviewDecisionPacket,
  ReviewFieldName,
  ReviewQueueFilters,
} from "@/types/review";

import {
  appendReviewNote,
  buildReviewDecisionPacket,
  ensureLegacyReviewCase,
  listReviewQueue,
  loadReviewAggregate,
  markReadyForDecision,
  reassignReview,
  releaseReview,
  reopenReview,
  ReviewRepositoryError,
  saveChecklistDecision,
  saveMetadataDecision,
  saveTermDecision,
  startOrClaimReview,
} from "./repository";
import { parseReviewFieldValue } from "./validation";

export { REVIEW_CONFLICT_MESSAGE, ReviewRepositoryError } from "./repository";

export function getReviewQueue(userId: string, filters: ReviewQueueFilters) {
  return listReviewQueue(getDatabase(), userId, filters);
}

export async function getReviewAggregate(
  submissionId: string,
  viewer: CurrentUser,
): Promise<ReviewAggregate | null> {
  await ensureLegacyReviewCase(getDatabase(), submissionId);
  return loadReviewAggregate(getDatabase(), submissionId, viewer);
}

export function startReview(submissionId: string, actorUserId: string) {
  return startOrClaimReview(getDatabase(), submissionId, actorUserId);
}

function sourceKey(field: ReviewFieldName): string {
  return {
    title: "workingTitle",
    description: "description",
    bpm: "bpm",
    keyTonic: "keyTonic",
    keyMode: "keyMode",
    timeSignature: "timeSignature",
    energyScore: "energyScore",
    valence: "valence",
    arousal: "arousal",
    vocalState: "vocalState",
    languageCode: "languageCode",
    era: "era",
    descriptionCaption: "descriptionCaption",
    format: "format",
    underDialogue: "underDialogue",
    loopable: "loopable",
    endingType: "endingType",
  }[field];
}

function aiKey(field: ReviewFieldName): string {
  return {
    title: "title",
    description: "description",
    bpm: "bpm",
    keyTonic: "key",
    keyMode: "key",
    timeSignature: "time_signature",
    energyScore: "energy",
    valence: "valence",
    arousal: "arousal",
    vocalState: "vocal_state",
    languageCode: "language_code",
    era: "musical_era",
    descriptionCaption: "transformer_caption",
    format: "format",
    underDialogue: "under_dialogue",
    loopable: "loopable",
    endingType: "ending_type",
  }[field];
}

function splitKey(value: unknown, part: "tonic" | "mode"): unknown {
  if (typeof value !== "string") return null;
  const [tonic, mode] = value.trim().split(/\s+/, 2);
  return part === "tonic" ? tonic || null : mode || null;
}

export async function saveReviewField(input: {
  reviewCaseId: string;
  submissionId: string;
  fieldName: ReviewFieldName;
  sourceKind: "producer" | "embedded" | "ai" | "coordinator" | "system";
  customValue?: string;
  rowVersion: number;
  actor: CurrentUser;
}) {
  const aggregate = await loadReviewAggregate(
    getDatabase(),
    input.submissionId,
    input.actor,
  );
  if (!aggregate || aggregate.reviewCase?.id !== input.reviewCaseId) {
    throw new ReviewRepositoryError("NOT_FOUND", "Review was not found.");
  }
  let raw: unknown;
  let sourceReference: string | null = null;
  if (input.sourceKind === "coordinator") {
    raw = input.customValue ?? "";
  } else if (input.sourceKind === "producer") {
    raw = aggregate.sources.producer[sourceKey(input.fieldName)];
    sourceReference = aggregate.revisionId;
  } else if (input.sourceKind === "embedded") {
    raw =
      aggregate.sources.embedded[sourceKey(input.fieldName)] ??
      aggregate.sources.embedded[input.fieldName];
    sourceReference = aggregate.revisionId;
  } else if (input.sourceKind === "ai") {
    raw = aggregate.sources.ai[aiKey(input.fieldName)];
    if (input.fieldName === "keyTonic") raw = splitKey(raw, "tonic");
    if (input.fieldName === "keyMode") raw = splitKey(raw, "mode");
    sourceReference = `cyanite:${aggregate.revisionId}`;
  } else {
    throw new ReviewRepositoryError(
      "INVALID_SOURCE",
      "System values cannot be selected manually.",
    );
  }
  if (raw === undefined || raw === null || raw === "") {
    throw new ReviewRepositoryError(
      "INVALID_SOURCE",
      "That source has no value for this field.",
    );
  }
  const value = parseReviewFieldValue(input.fieldName, raw);
  return saveMetadataDecision(getDatabase(), {
    reviewCaseId: input.reviewCaseId,
    fieldName: input.fieldName,
    expectedVersion: input.rowVersion,
    actor: input.actor,
    decision: {
      value,
      sourceKind: input.sourceKind,
      sourceReference,
      reviewed: true,
      reviewedByUserId: input.actor.id,
      reviewedAt: new Date().toISOString(),
    },
  });
}

export const updateReviewChecklist = (
  input: Parameters<typeof saveChecklistDecision>[1],
) => saveChecklistDecision(getDatabase(), input);
export const updateReviewTerm = (
  input: Parameters<typeof saveTermDecision>[1],
) => saveTermDecision(getDatabase(), input);
export const addReviewNote = (input: Parameters<typeof appendReviewNote>[1]) =>
  appendReviewNote(getDatabase(), input);
export const releaseAssignedReview = (
  id: string,
  version: number,
  actor: CurrentUser,
) => releaseReview(getDatabase(), id, version, actor);
export const assignReview = (
  id: string,
  assignee: string,
  version: number,
  actor: CurrentUser,
) => reassignReview(getDatabase(), id, assignee, version, actor);
export const completeReview = (
  id: string,
  version: number,
  actor: CurrentUser,
) => markReadyForDecision(getDatabase(), id, version, actor);
export const reopenReadyReview = (
  id: string,
  version: number,
  actor: CurrentUser,
) => reopenReview(getDatabase(), id, version, actor);

export function createReviewDecisionPacket(
  reviewCaseId: string,
): Promise<ReviewDecisionPacket> {
  return buildReviewDecisionPacket(getDatabase(), reviewCaseId);
}
