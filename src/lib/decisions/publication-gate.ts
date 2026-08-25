import type {
  PublicationGateInput,
  PublicationGateResult,
} from "@/types/decisions";

const ACCEPTABLE_COPYRIGHT_OUTCOMES = new Set([
  "no_claim_observed",
  "existing_internal_claim",
  "not_applicable",
]);

export function evaluatePublicationGate(
  input: PublicationGateInput,
  now = new Date(),
): PublicationGateResult {
  const blockers: string[] = [];
  const formatTerms = input.acceptedTerms.filter(
    (term) => term.category === "format",
  ).length;
  const useCaseTerms = input.acceptedTerms.filter(
    (term) => term.category === "use_case",
  ).length;
  const canonicalTitle = Boolean(input.canonicalTitle?.trim());
  const vocalState = Boolean(
    input.vocalState && input.vocalState !== "unknown",
  );

  if (!canonicalTitle) blockers.push("Canonical title is missing.");
  if (!vocalState) blockers.push("Vocal state must be reviewed.");
  if (formatTerms !== 1)
    blockers.push("Exactly one accepted Format is required.");
  if (useCaseTerms < 1)
    blockers.push("At least one accepted Use Case is required.");

  let rightsStatus: PublicationGateResult["evidence"]["rightsStatus"] = "ready";
  if (!input.rights) {
    rightsStatus = "missing";
    blockers.push("Rights declaration is missing.");
  } else if (
    input.rights.masterRightsBasis === "unknown" ||
    input.rights.compositionRightsBasis === "unknown"
  ) {
    rightsStatus = "unknown";
    blockers.push("Master and composition rights must both be known.");
  } else if (
    input.rights.validUntil &&
    input.rights.validUntil < now.toISOString().slice(0, 10)
  ) {
    rightsStatus = "expired";
    blockers.push("The declared rights period has expired.");
  }

  const copyrightStatus = input.copyright?.status ?? "missing";
  const copyrightOutcome = input.copyright?.outcome ?? null;
  if (!input.copyright) {
    blockers.push("Copyright review is missing.");
  } else if (input.copyright.status !== "completed") {
    blockers.push("Copyright review must be completed.");
  } else if (
    !copyrightOutcome ||
    !ACCEPTABLE_COPYRIGHT_OUTCOMES.has(copyrightOutcome)
  ) {
    blockers.push("Copyright outcome requires resolution before publication.");
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    checkedAt: now.toISOString(),
    evidence: {
      canonicalTitle,
      vocalState,
      formatTerms,
      useCaseTerms,
      rightsStatus,
      copyrightStatus,
      copyrightOutcome,
    },
  };
}
