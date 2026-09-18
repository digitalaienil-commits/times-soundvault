import { describe, expect, it } from "vitest";

import { buildPrompt, geminiMetadataSchema } from "./gemini-metadata";

/**
 * Search tags describe the track; use cases say which editorial slot it fits.
 * Only the second can become a taxonomy assignment, and only a taxonomy
 * assignment reaches the published search index — so a use case invented
 * outside the library's vocabulary is worth no more than free text.
 */
const promptBase = {
  source: { displayTitle: "T", originalFilename: "t.mp3", assetRole: "master" },
  probe: {},
  measurements: {},
  features: { bpm: 90 },
  fallback: { transformerCaption: "..." },
  hasAudio: true,
} as never as Omit<Parameters<typeof buildPrompt>[0], "useCaseVocabulary">;

describe("use-case vocabulary in the prompt", () => {
  it("offers the library's own labels rather than letting the model invent", () => {
    const prompt = buildPrompt({
      ...promptBase,
      useCaseVocabulary: ["Breaking News", "Weather", "Elections"],
    });

    expect(prompt).toContain("Breaking News");
    expect(prompt).toContain("Weather");
    expect(prompt).toContain("useCaseGuidance");
  });

  it("drops the guidance when the taxonomy could not be read", () => {
    const prompt = buildPrompt({ ...promptBase, useCaseVocabulary: [] });

    expect(prompt).not.toContain("useCaseGuidance");
    expect(prompt).not.toContain("useCaseVocabulary");
  });

  it("still asks for the field so a vocabulary outage is not silent", () => {
    const prompt = buildPrompt({ ...promptBase, useCaseVocabulary: [] });

    expect(prompt).toContain("useCases");
  });
});

describe("use cases returned by the provider", () => {
  it("parses a comma-separated string as readily as an array", () => {
    expect(
      geminiMetadataSchema.parse({ useCases: "Weather, General News" })
        .useCases,
    ).toEqual(["Weather", "General News"]);
  });

  it("is empty rather than guessed when the provider omits it", () => {
    expect(geminiMetadataSchema.parse({}).useCases).toEqual([]);
  });
});

/**
 * The register the search tags come back in decides whether a coordinator
 * recognises their own vocabulary. Scene descriptions read as captions; the
 * words people actually type are plainer than that.
 */
describe("search tag register", () => {
  it("asks for plain descriptive words, not scene descriptions", () => {
    const prompt = buildPrompt({ ...promptBase, useCaseVocabulary: [] });

    expect(prompt).toContain("dark");
    expect(prompt).toContain("upbeat");
  });
});
