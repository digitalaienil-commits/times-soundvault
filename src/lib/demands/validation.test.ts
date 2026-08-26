import { describe, expect, it } from "vitest";

import {
  demandCreateSchema,
  hasMeaningfulCreativeRequirement,
  hasMusicUseCaseOrFormat,
} from "./validation";

const termId = "11111111-1111-4111-8111-111111111111";
const base = {
  title: "Summer campaign music",
  requesterName: null,
  requestingTeam: "Brand",
  projectContext: "National summer campaign",
  brief: "Warm, confident music for a national summer campaign film.",
  creativeNotes: null,
  avoidNotes: null,
  priority: "high" as const,
  assetKind: "music" as const,
  targetTrackCount: 2,
  responseDeadlineOn: "2026-09-01",
  neededByOn: "2026-09-05",
  bpmMin: 90,
  bpmMax: 120,
  durationMinMs: 30_000,
  durationMaxMs: 60_000,
  vocalState: "instrumental" as const,
  underDialogue: true,
  loopable: null,
  stemsRequired: true,
  endingType: "final_hit" as const,
  ownerUserId: "coordinator-1",
  termRequirements: [{ termId, importance: "required" as const }],
  assigneeUserIds: ["producer-1"],
  referenceTrackIds: [],
  intent: "open" as const,
};

describe("Demand validation", () => {
  it("accepts a complete open Demand and normalizes optional text", () => {
    const result = demandCreateSchema.parse({ ...base, requesterName: " " });
    expect(result.requesterName).toBeNull();
    expect(hasMeaningfulCreativeRequirement(result)).toBe(true);
  });

  it("rejects inverted dates, BPM ranges and repeated taxonomy terms", () => {
    const result = demandCreateSchema.safeParse({
      ...base,
      responseDeadlineOn: "2026-09-07",
      neededByOn: "2026-09-05",
      bpmMin: 140,
      bpmMax: 100,
      termRequirements: [
        { termId, importance: "required" },
        { termId, importance: "preferred" },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining([
        "responseDeadlineOn",
        "bpmMax",
        "termRequirements",
      ]),
    );
  });

  it("requires a music use-case or format term before opening", () => {
    const parsed = demandCreateSchema.parse(base);
    expect(hasMusicUseCaseOrFormat(parsed, new Map([[termId, "mood"]]))).toBe(
      false,
    );
    expect(
      hasMusicUseCaseOrFormat(parsed, new Map([[termId, "use_case"]])),
    ).toBe(true);
  });
});
