import "server-only";

import { getDatabase } from "@/lib/database/database";

import {
  approveReview,
  bulkApproveReviews,
  bulkPublishTracks,
  confirmReviewRejection,
  listApprovedForPublication,
  loadSubmissionDecisionSummary,
  publishApprovedTrack,
  recommendReviewRejection,
  requestReviewChanges,
  returnRejectedReviewForChanges,
  withdrawPublishedTrack,
} from "./repository";

export {
  DECISION_CONFLICT_MESSAGE,
  DecisionRepositoryError,
} from "./repository";

export const approveSubmissionReview = (
  input: Parameters<typeof approveReview>[1],
) => approveReview(getDatabase(), input);

export const requestSubmissionChanges = (
  input: Parameters<typeof requestReviewChanges>[1],
) => requestReviewChanges(getDatabase(), input);

export const recommendSubmissionRejection = (
  input: Parameters<typeof recommendReviewRejection>[1],
) => recommendReviewRejection(getDatabase(), input);

export const confirmSubmissionRejection = (
  input: Parameters<typeof confirmReviewRejection>[1],
) => confirmReviewRejection(getDatabase(), input);

export const returnSubmissionForChanges = (
  input: Parameters<typeof returnRejectedReviewForChanges>[1],
) => returnRejectedReviewForChanges(getDatabase(), input);

export const publishSubmissionTrack = (
  input: Parameters<typeof publishApprovedTrack>[1],
) => publishApprovedTrack(getDatabase(), input);

export const withdrawSubmissionTrack = (
  input: Parameters<typeof withdrawPublishedTrack>[1],
) => withdrawPublishedTrack(getDatabase(), input);

export const approveSubmissionReviews = (
  input: Parameters<typeof bulkApproveReviews>[1],
) => bulkApproveReviews(getDatabase(), input);

export const publishSubmissionTracks = (
  input: Parameters<typeof bulkPublishTracks>[1],
) => bulkPublishTracks(getDatabase(), input);

export const getApprovedPublicationQueue = () =>
  listApprovedForPublication(getDatabase());

export const getSubmissionDecisionSummary = (
  submissionId: string,
  includeInternal: boolean,
) =>
  loadSubmissionDecisionSummary(getDatabase(), submissionId, includeInternal);
