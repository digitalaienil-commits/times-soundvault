import type { SubmissionStatus } from "@/types/domain/submission";

export const SUBMISSION_TRANSITIONS = {
  draft: ["submitted"],
  submitted: ["processing"],
  processing: ["ready_for_review"],
  ready_for_review: ["in_review"],
  in_review: ["approved", "changes_requested", "rejection_recommended"],
  changes_requested: ["submitted"],
  rejection_recommended: ["rejected", "changes_requested"],
  approved: [],
  rejected: [],
  archived: [],
} as const satisfies Record<SubmissionStatus, readonly SubmissionStatus[]>;

export function canTransitionSubmission(
  from: SubmissionStatus,
  to: SubmissionStatus,
): boolean {
  return (SUBMISSION_TRANSITIONS[from] as readonly SubmissionStatus[]).includes(
    to,
  );
}

export function assertSubmissionTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
): void {
  if (!canTransitionSubmission(from, to)) {
    throw new SubmissionLifecycleError(
      `Submission cannot transition from ${from} to ${to}`,
    );
  }
}

export class SubmissionLifecycleError extends Error {
  readonly code = "INVALID_SUBMISSION_TRANSITION";

  constructor(message: string) {
    super(message);
    this.name = "SubmissionLifecycleError";
  }
}
