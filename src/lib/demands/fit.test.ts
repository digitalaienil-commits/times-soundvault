import { describe, expect, it } from "vitest";

import type { DemandTermRequirement } from "@/types/demands";

import { evaluateTrackAgainstDemand } from "./fit";

const required: DemandTermRequirement = {
  id: "req-1",
  termId: "term-required",
  category: "mood",
  slug: "warm",
  label: "Warm",
  active: true,
  importance: "required",
};
const preferred: DemandTermRequirement = {
  id: "pref-1",
  termId: "term-preferred",
  category: "instrument",
  slug: "guitar",
  label: "Guitar",
  active: true,
  importance: "preferred",
};
const demand = {
  assetKind: "music" as const,
  bpmMin: 90,
  bpmMax: 120,
  durationMinMs: 30_000,
  durationMaxMs: 60_000,
  vocalState: "instrumental" as const,
  underDialogue: true,
  loopable: null,
  stemsRequired: true,
  endingType: "final_hit" as const,
  requirements: [required, preferred],
};
const matchingTrack = {
  assetKind: "music" as const,
  bpm: 105,
  durationMs: 45_000,
  vocalState: "instrumental" as const,
  underDialogue: true,
  loopable: false,
  stemCount: 4,
  endingType: "final_hit" as const,
  acceptedTermIds: [required.termId],
};

describe("Demand fit evaluation", () => {
  it("allows acceptance when every required field matches even if a preference is absent", () => {
    const result = evaluateTrackAgainstDemand(demand, matchingTrack);
    expect(result.eligibleForAcceptance).toBe(true);
    expect(result.preferredMissing).toEqual(["Guitar"]);
    expect(result.requiredMismatches).toEqual([]);
  });

  it("reports deterministic required blockers and missing canonical values", () => {
    const result = evaluateTrackAgainstDemand(demand, {
      ...matchingTrack,
      bpm: null,
      stemCount: 0,
      acceptedTermIds: [],
    });
    expect(result.eligibleForAcceptance).toBe(false);
    expect(result.requiredMismatches.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "bpm_min",
        "bpm_max",
        "stems",
        "term:term-required",
      ]),
    );
    expect(result.warnings).toContain(
      "Track BPM is missing from canonical metadata.",
    );
  });

  it("blocks acceptance when a required taxonomy term has become inactive", () => {
    const result = evaluateTrackAgainstDemand(
      { ...demand, requirements: [{ ...required, active: false }] },
      matchingTrack,
    );
    expect(result.eligibleForAcceptance).toBe(false);
    expect(result.requiredMismatches[0]?.code).toBe("inactive_term");
  });
});
