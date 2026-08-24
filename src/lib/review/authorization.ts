import type { CurrentUser } from "@/types/auth";
import type { ReviewCaseStatus } from "@/types/review";

interface ReviewAuthorizationSubject {
  status: ReviewCaseStatus;
  assignedToUserId: string | null;
}

export function canReadReview(user: CurrentUser): boolean {
  return user.role === "admin" || user.role === "coordinator";
}

export function canClaimReview(
  user: CurrentUser,
  review: ReviewAuthorizationSubject | null,
): boolean {
  return (
    canReadReview(user) &&
    (!review ||
      (review.status === "in_progress" && review.assignedToUserId === null))
  );
}

export function canEditReview(
  user: CurrentUser,
  review: ReviewAuthorizationSubject,
): boolean {
  return (
    review.status === "in_progress" &&
    (user.role === "admin" ||
      (user.role === "coordinator" && review.assignedToUserId === user.id))
  );
}

export function canReassignReview(user: CurrentUser): boolean {
  return user.role === "admin";
}

export function canMarkReadyForDecision(
  user: CurrentUser,
  review: ReviewAuthorizationSubject,
): boolean {
  return canEditReview(user, review);
}
