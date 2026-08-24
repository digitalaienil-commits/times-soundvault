import { describe, expect, it } from "vitest";

import type { CurrentUser } from "@/types/auth";

import {
  canClaimReview,
  canEditReview,
  canMarkReadyForDecision,
  canReadReview,
  canReassignReview,
} from "./authorization";

function user(role: CurrentUser["role"], id: string = role): CurrentUser {
  return {
    id,
    name: role,
    email: `${role}@soundvault.test`,
    initials: "SV",
    role,
    accessStatus: "active",
  };
}

describe("review authorization", () => {
  it("limits read and claim access to Admin and Coordinator", () => {
    expect(canReadReview(user("admin"))).toBe(true);
    expect(canReadReview(user("coordinator"))).toBe(true);
    expect(canReadReview(user("music_producer"))).toBe(false);
    expect(canReadReview(user("user"))).toBe(false);
    expect(
      canClaimReview(user("coordinator"), {
        status: "in_progress",
        assignedToUserId: null,
      }),
    ).toBe(true);
  });

  it("makes another Coordinator read-only and gives Admin reassignment control", () => {
    const review = {
      status: "in_progress" as const,
      assignedToUserId: "owner",
    };
    expect(canEditReview(user("coordinator", "owner"), review)).toBe(true);
    expect(canEditReview(user("coordinator", "observer"), review)).toBe(false);
    expect(canEditReview(user("admin"), review)).toBe(true);
    expect(canReassignReview(user("admin"))).toBe(true);
    expect(canReassignReview(user("coordinator"))).toBe(false);
  });

  it("locks ready reviews for ordinary mutation", () => {
    const review = {
      status: "ready_for_decision" as const,
      assignedToUserId: "owner",
    };
    expect(canEditReview(user("coordinator", "owner"), review)).toBe(false);
    expect(canMarkReadyForDecision(user("admin"), review)).toBe(false);
  });
});
