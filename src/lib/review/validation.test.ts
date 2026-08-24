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
