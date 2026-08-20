import { describe, expect, it } from "vitest";

import {
  assertSubmissionTransition,
  canTransitionSubmission,
} from "./lifecycle";

describe("submission lifecycle", () => {
  it("allows every defined forward workflow branch", () => {
    expect(canTransitionSubmission("draft", "submitted")).toBe(true);
    expect(canTransitionSubmission("submitted", "processing")).toBe(true);
    expect(canTransitionSubmission("processing", "ready_for_review")).toBe(
      true,
    );
    expect(canTransitionSubmission("ready_for_review", "in_review")).toBe(true);
    expect(canTransitionSubmission("in_review", "approved")).toBe(true);
    expect(canTransitionSubmission("in_review", "changes_requested")).toBe(
      true,
    );
    expect(canTransitionSubmission("in_review", "rejection_recommended")).toBe(
      true,
    );
    expect(canTransitionSubmission("rejection_recommended", "rejected")).toBe(
      true,
    );
  });

  it("rejects arbitrary, backwards and publication-like status changes", () => {
    expect(canTransitionSubmission("draft", "approved")).toBe(false);
    expect(canTransitionSubmission("approved", "in_review")).toBe(false);
    expect(() =>
      assertSubmissionTransition("changes_requested", "processing"),
    ).toThrowError(/cannot transition/);
  });
});
