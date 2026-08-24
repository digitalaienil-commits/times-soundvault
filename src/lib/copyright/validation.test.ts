import { describe, expect, it } from "vitest";

import { COPYRIGHT_OUTCOMES } from "@/types/copyright";

import { observationInputSchema, youtubeVideoIdSchema } from "./validation";

describe("copyright observation terminology", () => {
  it("uses no_claim_observed and never defines copyright_clear", () => {
    expect(COPYRIGHT_OUTCOMES).toContain("no_claim_observed");
    expect(COPYRIGHT_OUTCOMES).not.toContain("copyright_clear" as never);
  });

  it("keeps a Content ID claim distinct from a copyright strike", () => {
    const claim = observationInputSchema.parse({
      copyrightCheckId: "00000000-0000-4000-8000-000000000001",
      observationType: "content_id_claim",
      observedAt: new Date(),
    });
    expect(claim.observationType).toBe("content_id_claim");
    expect(claim.observationType).not.toBe("copyright_strike");
  });

  it("requires explicit confirmation and a note for a strike", () => {
    expect(
      observationInputSchema.safeParse({
        copyrightCheckId: "00000000-0000-4000-8000-000000000001",
        observationType: "copyright_strike",
        observedAt: new Date(),
      }).success,
    ).toBe(false);
  });

  it("accepts only a strict YouTube video ID and never a URL", () => {
    expect(youtubeVideoIdSchema.parse("AbCdEfG_123")).toBe("AbCdEfG_123");
    expect(
      youtubeVideoIdSchema.safeParse("https://youtu.be/AbCdEfG_123").success,
    ).toBe(false);
  });
});
