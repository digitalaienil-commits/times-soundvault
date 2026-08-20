import "server-only";

import { getDatabase } from "@/lib/database/database";

import {
  listAllSubmissions,
  listProducerSubmissions,
  listReviewableSubmissions,
} from "./repository";

export async function getProducerSubmissionList(ownerUserId: string) {
  return listProducerSubmissions(getDatabase(), ownerUserId);
}

export async function getAllSubmissionList() {
  return listAllSubmissions(getDatabase());
}

export async function getCoordinatorReviewList() {
  return listReviewableSubmissions(getDatabase());
}
