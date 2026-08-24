import { describe, expect, it } from "vitest";

import {
  assessChecklist,
  assessDeclaredEligibility,
  type EligibilityChecklist,
} from "./eligibility";

const readyChecklist: EligibilityChecklist = {
  exclusiveMasterRights: "yes",
  compositionRights: "yes",
  nonExclusiveComponents: "no",
  thirdPartySamplesOrLoops: "no",
  sufficientlyDistinct: "yes",
  individualMusicalWork: "yes",
  genericProductionAudio: "no",
  ownershipTerritoryKnown: "yes",
  ownershipPeriodKnown: "yes",
  identificationMetadataAvailable: "yes",
  existingYouTubeReferenceKnown: "no",
  manualPolicyReviewRequired: "no",
};

describe("Content ID eligibility", () => {
  it("treats owned or exclusive declarations only as potentially eligible", () => {
    expect(
      assessDeclaredEligibility({
        masterRightsBasis: "owned",
        compositionRightsBasis: "exclusive_license",
        assetKind: "music",
      }),
    ).toBe("potentially_eligible");
  });

  it("routes unknown rights to rights review and non-exclusive rights to ineligible", () => {
    expect(
      assessDeclaredEligibility({
        masterRightsBasis: "unknown",
        compositionRightsBasis: "owned",
        assetKind: "music",
      }),
    ).toBe("needs_rights_review");
    expect(
      assessDeclaredEligibility({
        masterRightsBasis: "non_exclusive_license",
        compositionRightsBasis: "owned",
        assetKind: "music",
      }),
    ).toBe("ineligible");
  });

  it("keeps generic SFX and ambience in policy review", () => {
    expect(
      assessDeclaredEligibility({
        masterRightsBasis: "owned",
        compositionRightsBasis: "owned",
        assetKind: "sound_effect",
      }),
    ).toBe("needs_policy_review");
  });

  it("requires rights, policy, and metadata gates before future readiness", () => {
    expect(assessChecklist(readyChecklist)).toEqual({
      eligibility: "approved_for_future_reference",
      readiness: "ready_for_future_registration",
    });
    expect(
      assessChecklist({
        ...readyChecklist,
        ownershipTerritoryKnown: "unknown",
      }),
    ).toEqual({
      eligibility: "needs_rights_review",
      readiness: "needs_rights_review",
    });
    expect(
      assessChecklist({ ...readyChecklist, genericProductionAudio: "yes" }),
    ).toEqual({
      eligibility: "needs_policy_review",
      readiness: "needs_policy_review",
    });
    expect(
      assessChecklist({
        ...readyChecklist,
        identificationMetadataAvailable: "no",
      }),
    ).toEqual({
      eligibility: "potentially_eligible",
      readiness: "needs_metadata",
    });
  });
});
