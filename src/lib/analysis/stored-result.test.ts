import { describe, expect, it } from "vitest";

import { parseStoredAnalysisResult } from "./stored-result";

/**
 * A stored result is whatever shape the analyser had when it ran. The row that
 * crashed the submission page was written after searchTags shipped but before
 * useCases did, so the page read `undefined.length` on a field the type
 * promised was an array.
 */
describe("reading a stored analysis result", () => {
  it("fills a field the writing version did not know about", () => {
    const stored = {
      genres: ["cinematic metal"],
      moods: ["epic", "heroic"],
      instruments: ["electric guitar"],
      searchTags: ["epic battle scene"],
      bpm: 97.72,
      key: "Eb major",
    };

    const result = parseStoredAnalysisResult(stored);

    expect(result?.useCases).toEqual([]);
    expect(result?.searchTags).toEqual(["epic battle scene"]);
    expect(result?.genres).toEqual(["cinematic metal"]);
    expect(result?.bpm).toBe(97.72);
  });

  it("gives every list a value, so the page never reads undefined", () => {
    const result = parseStoredAnalysisResult({});

    for (const field of [
      "genres",
      "subgenres",
      "moods",
      "instruments",
      "voiceTags",
      "character",
      "movement",
      "freeGenreTags",
      "searchTags",
      "useCases",
      "segments",
    ] as const) {
      expect(result?.[field]).toEqual([]);
    }
  });

  it("reads a missing result as absent rather than an empty analysis", () => {
    expect(parseStoredAnalysisResult(null)).toBeNull();
    expect(parseStoredAnalysisResult(undefined)).toBeNull();
    expect(parseStoredAnalysisResult([])).toBeNull();
  });

  it("drops non-string list entries instead of failing the read", () => {
    const result = parseStoredAnalysisResult({
      moods: ["epic", 42, null, "heroic"],
    });

    expect(result?.moods).toEqual(["epic", "heroic"]);
  });

  it("keeps a scalar the UI renders with a fallback", () => {
    const result = parseStoredAnalysisResult({ timeSignature: "4/4" });

    expect(result?.timeSignature).toBe("4/4");
    expect(result?.key).toBeNull();
  });
});
