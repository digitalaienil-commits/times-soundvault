import type {
  ContentIdReadinessStatus,
  CopyrightEligibilityStatus,
} from "@/types/copyright";

export const ELIGIBILITY_QUESTIONS = [
  "exclusiveMasterRights",
  "compositionRights",
  "nonExclusiveComponents",
  "thirdPartySamplesOrLoops",
  "sufficientlyDistinct",
  "individualMusicalWork",
  "genericProductionAudio",
  "ownershipTerritoryKnown",
  "ownershipPeriodKnown",
  "identificationMetadataAvailable",
  "existingYouTubeReferenceKnown",
  "manualPolicyReviewRequired",
] as const;

export type EligibilityAnswer = "yes" | "no" | "unknown";
export type EligibilityChecklist = Record<
  (typeof ELIGIBILITY_QUESTIONS)[number],
  EligibilityAnswer
>;

export function assessDeclaredEligibility(input: {
  masterRightsBasis: string | null;
  compositionRightsBasis: string | null;
  assetKind: string;
}): CopyrightEligibilityStatus {
  if (!input.masterRightsBasis || !input.compositionRightsBasis)
    return "needs_rights_review";
  if (
    input.masterRightsBasis === "non_exclusive_license" ||
    input.compositionRightsBasis === "non_exclusive_license"
  )
    return "ineligible";
  if (
    input.masterRightsBasis === "unknown" ||
    input.compositionRightsBasis === "unknown"
  )
    return "needs_rights_review";
  if (["sound_effect", "ambience"].includes(input.assetKind))
    return "needs_policy_review";
  if (
    ["owned", "exclusive_license"].includes(input.masterRightsBasis) &&
    ["owned", "exclusive_license"].includes(input.compositionRightsBasis)
  )
    return "potentially_eligible";
  return "needs_policy_review";
}

export function assessChecklist(checklist: EligibilityChecklist): {
  eligibility: CopyrightEligibilityStatus;
  readiness: ContentIdReadinessStatus;
} {
  if (
    checklist.nonExclusiveComponents === "yes" ||
    checklist.exclusiveMasterRights === "no"
  )
    return { eligibility: "ineligible", readiness: "ineligible" };
  if (
    checklist.exclusiveMasterRights === "unknown" ||
    checklist.compositionRights === "unknown" ||
    checklist.ownershipTerritoryKnown !== "yes" ||
    checklist.ownershipPeriodKnown !== "yes"
  )
    return {
      eligibility: "needs_rights_review",
      readiness: "needs_rights_review",
    };
  if (
    checklist.thirdPartySamplesOrLoops !== "no" ||
    checklist.sufficientlyDistinct !== "yes" ||
    checklist.individualMusicalWork !== "yes" ||
    checklist.genericProductionAudio !== "no" ||
    checklist.manualPolicyReviewRequired === "yes"
  )
    return {
      eligibility: "needs_policy_review",
      readiness: "needs_policy_review",
    };
  if (checklist.identificationMetadataAvailable !== "yes")
    return {
      eligibility: "potentially_eligible",
      readiness: "needs_metadata",
    };
  if (checklist.existingYouTubeReferenceKnown === "yes")
    return {
      eligibility: "approved_for_future_reference",
      readiness: "existing_reference",
    };
  return {
    eligibility: "approved_for_future_reference",
    readiness: "ready_for_future_registration",
  };
}
