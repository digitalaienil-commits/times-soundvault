import { describe, expect, it } from "vitest";

import { geminiMetadataSchema } from "./gemini-metadata";

/**
 * Genre and mood say what a track is. Search tags say what it is for, which is
 * what somebody hunting for a cue actually types. They come back from the
 * provider as model-authored JSON, so the same tolerance the rest of the
 * schema has applies here.
 */
describe("AI search tags", () => {
  it("survives a provider returning a comma-separated string", () => {
    const parsed = geminiMetadataSchema.parse({
      searchTags: "breaking news sting, urgent, newsroom opener",
    });
    expect(parsed.searchTags).toEqual([
      "breaking news sting",
      "urgent",
      "newsroom opener",
    ]);
  });

  it("is absent rather than invented when the provider omits it", () => {
    expect(geminiMetadataSchema.parse({}).searchTags).toEqual([]);
  });

  it("drops non-string entries instead of failing the whole analysis", () => {
    const parsed = geminiMetadataSchema.parse({
      searchTags: ["wedding sangeet", 42, null, "festival promo"],
    });
    expect(parsed.searchTags).toEqual(["wedding sangeet", "festival promo"]);
  });

  it("bounds the list so one response cannot flood the suggestions", () => {
    const parsed = geminiMetadataSchema.parse({
      searchTags: Array.from({ length: 40 }, (_, index) => `tag-${index}`),
    });
    expect(parsed.searchTags.length).toBeLessThanOrEqual(12);
  });
});
