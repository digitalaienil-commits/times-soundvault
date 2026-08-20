import { describe, expect, it } from "vitest";

import {
  contentIdEligibilitySchema,
  rightsBasisSchema,
  rightsDeclarationInputSchema,
} from "./validation";

describe("rights validation", () => {
  it("accepts unknown rights without inferring Content ID eligibility", () => {
    expect(
      rightsDeclarationInputSchema.parse({
        masterRightsBasis: "unknown",
        compositionRightsBasis: "unknown",
      }),
    ).toMatchObject({ contentIdEligibility: "unknown" });
  });

  it("validates rights and copyright values independently", () => {
    expect(rightsBasisSchema.parse("exclusive_license")).toBe(
      "exclusive_license",
    );
    expect(contentIdEligibilitySchema.parse("needs_review")).toBe(
      "needs_review",
    );
    expect(() => rightsBasisSchema.parse("verified")).toThrow();
  });

  it("rejects an end date before the start date", () => {
    expect(() =>
      rightsDeclarationInputSchema.parse({
        masterRightsBasis: "owned",
        compositionRightsBasis: "owned",
        validFrom: "2026-08-20",
        validUntil: "2026-08-19",
      }),
    ).toThrowError(/end date/);
  });
});
