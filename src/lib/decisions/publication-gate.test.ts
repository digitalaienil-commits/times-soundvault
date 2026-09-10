import { describe, expect, it } from "vitest";

import { evaluatePublicationGate } from "./publication-gate";

const ready = {
  canonicalTitle: "News Bed",
  vocalState: "instrumental",
  acceptedTerms: [
    { category: "format", label: "Background Bed" },
    { category: "use_case", label: "General News" },
  ],
  rights: {
    masterRightsBasis: "owned",
    compositionRightsBasis: "exclusive_license",
    validUntil: "2027-08-25",
  },
  copyright: { status: "completed", outcome: "no_claim_observed" },
};

describe("evaluatePublicationGate", () => {
  it("allows a governed approved packet", () => {
    expect(
      evaluatePublicationGate(ready, new Date("2026-08-25T00:00:00Z")),
    ).toMatchObject({ allowed: true, blockers: [] });
  });

  it.each([
    ["third_party_claim_observed"],
    ["ownership_conflict"],
    ["reference_overlap"],
    ["copyright_strike_observed"],
    ["inconclusive"],
  ])("blocks the copyright outcome %s", (outcome) => {
    const result = evaluatePublicationGate({
      ...ready,
      copyright: { status: "completed", outcome },
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks unknown or expired rights", () => {
    const result = evaluatePublicationGate(
      {
        ...ready,
        rights: {
          masterRightsBasis: "unknown",
          compositionRightsBasis: "owned",
          validUntil: "2025-01-01",
        },
      },
      new Date("2026-08-25T00:00:00Z"),
    );
    expect(result.allowed).toBe(false);
    // The blocker names the side that is actually undeclared, and where to fix
    // it. Composition is "owned" here, so only Master should be reported.
    const rightsBlocker = result.blockers.find((blocker) =>
      blocker.includes("rights are undeclared"),
    );
    expect(rightsBlocker).toContain("Master recording");
    expect(rightsBlocker).not.toContain("Composition");
    expect(rightsBlocker).toContain("Upload workspace");
  });

  it("names both sides when neither is declared", () => {
    const result = evaluatePublicationGate({
      ...ready,
      rights: {
        masterRightsBasis: "unknown",
        compositionRightsBasis: "unknown",
        validUntil: null,
      },
    });

    expect(result.allowed).toBe(false);
    expect(
      result.blockers.some(
        (blocker) =>
          blocker.includes("Master recording and Composition") &&
          blocker.includes("undeclared"),
      ),
    ).toBe(true);
  });

  it("allows explicit not applicable copyright but never labels it clear", () => {
    const result = evaluatePublicationGate({
      ...ready,
      copyright: { status: "completed", outcome: "not_applicable" },
    });
    expect(result.allowed).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/copyright clear/i);
  });
});
