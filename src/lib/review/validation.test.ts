import { describe, expect, it } from "vitest";

import {
  parseReviewFieldValue,
  reviewChecklistInputSchema,
} from "./validation";

describe("review validation", () => {
  it("rejects invalid canonical candidates", () => {
    expect(() => parseReviewFieldValue("bpm", "401")).toThrow();
    expect(() => parseReviewFieldValue("energyScore", "1.1")).toThrow();
    expect(() => parseReviewFieldValue("languageCode", "english")).toThrow();
  });

  it("permits missing optional values and bounds valid candidates", () => {
    expect(parseReviewFieldValue("description", "")).toBeNull();
    expect(parseReviewFieldValue("bpm", "109")).toBe(109);
    expect(parseReviewFieldValue("languageCode", "en-IN")).toBe("en-IN");
  });

  it("requires an attention note", () => {
    expect(
      reviewChecklistInputSchema.safeParse({
        reviewCaseId: "550e8400-e29b-41d4-a716-446655440000",
        code: "rights",
        status: "attention",
        rowVersion: 1,
      }).success,
    ).toBe(false);
  });
});

describe("AI energy suggestion is usable in review", () => {
  it("accepts the numeric energy score the provider now returns", () => {
    // Review stores energy as a 0-1 score. The provider used to supply only a
    // categorical label, so choosing "AI suggestion" for Energy always failed
    // with "Invalid input".
    expect(parseReviewFieldValue("energyScore", "0.82")).toBe(0.82);
    expect(parseReviewFieldValue("energyScore", "")).toBeNull();
  });

  it("still rejects a categorical label", () => {
    expect(() => parseReviewFieldValue("energyScore", "very high")).toThrow();
  });
});
