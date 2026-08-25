import "server-only";

import { getDatabase } from "@/lib/database/database";
import type { CurrentUser } from "@/types/auth";

import {
  listResumableBatches,
  listBatchWorkspaceSubmissions,
  listSubmissionEvents,
  listUploadWorkspaceSubmissions,
  loadWorkspaceSubmission,
  loadRevisionUploadContext,
} from "./repository";

export function getUploadWorkspaceSubmissions(user: CurrentUser) {
  return listUploadWorkspaceSubmissions(getDatabase(), user);
}

export function getUploadWorkspaceSubmission(
  submissionId: string,
  user: CurrentUser,
) {
  return loadWorkspaceSubmission(getDatabase(), submissionId, user);
}

export function getResumableUploadBatches(user: CurrentUser) {
  return listResumableBatches(getDatabase(), user);
}

export function getUploadBatchSubmissions(batchId: string, user: CurrentUser) {
  return listBatchWorkspaceSubmissions(getDatabase(), batchId, user);
}

export function getUploadSubmissionEvents(submissionId: string) {
  return listSubmissionEvents(getDatabase(), submissionId);
}

export function getRevisionUploadContext(
  submissionId: string,
  user: CurrentUser,
) {
  return loadRevisionUploadContext(getDatabase(), submissionId, user);
}
