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

  if (!canonicalTitle)
    blockers.push(
      "Canonical title is missing. Review the Title field in the Coordinator review workspace.",
    );
  if (!vocalState)
    blockers.push(
      "Vocal state is still unknown. Set it in the Coordinator review workspace.",
    );
  if (formatTerms !== 1)
    blockers.push(
      formatTerms === 0
        ? "No Format term is accepted. Select exactly one Format in the review workspace taxonomy."
        : `${formatTerms} Format terms are accepted. Exactly one is allowed, so deselect the extras in the review workspace taxonomy.`,
    );
  if (useCaseTerms < 1)
    blockers.push(
      "No Use Case term is accepted. Select at least one in the review workspace taxonomy.",
    );

  let rightsStatus: PublicationGateResult["evidence"]["rightsStatus"] = "ready";
  if (!input.rights) {
    rightsStatus = "missing";
    blockers.push(
      "No rights declaration exists for this Revision. The Producer declares rights when uploading.",
    );
  } else if (
    input.rights.masterRightsBasis === "unknown" ||
    input.rights.compositionRightsBasis === "unknown"
  ) {
    rightsStatus = "unknown";
    // Name the side that is actually undeclared: "both must be known" left the
    // reader guessing which one, and where to change it.
    const undeclared = [
      input.rights.masterRightsBasis === "unknown" ? "Master recording" : null,
      input.rights.compositionRightsBasis === "unknown" ? "Composition" : null,
    ].filter(Boolean);
    blockers.push(
      `${undeclared.join(" and ")} rights are undeclared. A Producer sets them on the Track in the Upload workspace; an approved Revision needs changes requested first.`,
    );
  } else if (
    input.rights.validUntil &&
    input.rights.validUntil < now.toISOString().slice(0, 10)
  ) {
    rightsStatus = "expired";
    blockers.push(
      `The declared rights period expired on ${input.rights.validUntil}. A new declaration is required.`,
    );
  }

  const copyrightStatus = input.copyright?.status ?? "missing";
  const copyrightOutcome = input.copyright?.outcome ?? null;
  if (!input.copyright) {
    blockers.push(
      "No copyright check exists for this Revision. Run pnpm copyright:reconcile, then record an outcome in Copyright.",
    );
  } else if (input.copyright.status !== "completed") {
    blockers.push(
      `The copyright check is "${input.copyright.status}", not completed. In Copyright, create a test batch for this Track and record its outcome.`,
    );
  } else if (
    !copyrightOutcome ||
    !ACCEPTABLE_COPYRIGHT_OUTCOMES.has(copyrightOutcome)
  ) {
    blockers.push(
      copyrightOutcome
        ? `The copyright outcome "${copyrightOutcome}" must be resolved before publication.`
        : "The copyright check completed without an outcome. Record one in Copyright.",
    );
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
