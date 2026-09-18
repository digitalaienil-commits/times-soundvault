import { describe, expect, it } from "vitest";

import { evaluatePublicationGate } from "./publication-gate";

const approved = {
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
};

const at = new Date("2026-08-25T00:00:00Z");

/**
 * A deployment without a Content ID account still has to publish. Switching
 * the stage off is an operator decision, and the point of these tests is that
 * it stays a *visible* one: nothing else about the gate relaxes, and the
 * evidence distinguishes a Track that skipped the stage from one that passed.
 */
describe("publication with the copyright stage switched off", () => {
  it("no longer blocks on a missing copyright check", () => {
    const blocked = evaluatePublicationGate(
      { ...approved, copyright: null, copyrightRequired: true },
      at,
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockers.join(" ")).toMatch(/copyright/i);

    const allowed = evaluatePublicationGate(
      { ...approved, copyright: null, copyrightRequired: false },
      at,
    );
    expect(allowed).toMatchObject({ allowed: true, blockers: [] });
  });

  it("records that no check was required rather than that one passed", () => {
    const result = evaluatePublicationGate(
      { ...approved, copyright: null, copyrightRequired: false },
      at,
    );
    expect(result.evidence.copyrightStatus).toBe("not_required");
    expect(result.evidence.copyrightOutcome).toBeNull();
  });

  it("ignores a stale outcome that would otherwise have blocked", () => {
    // The stage is off, so an old adverse result is not evidence about this
    // deployment's policy either way. It must not silently read as a pass.
    const result = evaluatePublicationGate(
      {
        ...approved,
        copyright: { status: "completed", outcome: "ownership_conflict" },
        copyrightRequired: false,
      },
      at,
    );
    expect(result.allowed).toBe(true);
    expect(result.evidence.copyrightStatus).toBe("not_required");
  });

  it("relaxes nothing else", () => {
    const result = evaluatePublicationGate(
      {
        ...approved,
        canonicalTitle: null,
        rights: null,
        copyright: null,
        copyrightRequired: false,
      },
      at,
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers).toHaveLength(2);
    expect(result.blockers.join(" ")).toMatch(/title/i);
    expect(result.blockers.join(" ")).toMatch(/rights/i);
  });
});
