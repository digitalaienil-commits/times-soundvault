import { describe, expect, it } from "vitest";
import { buildStemAlignmentIssue, possibleDuplicateIssue } from "./qc";

describe("technical QC", () => {
  it("flags stems beyond the 250 ms alignment tolerance", () => {
    expect(
      buildStemAlignmentIssue({
        audioFileId: "stem",
        masterDurationMs: 10_000,
        stemDurationMs: 10_251,
      })?.code,
    ).toBe("stem_duration_mismatch");
    expect(
      buildStemAlignmentIssue({
        audioFileId: "stem",
        masterDurationMs: 10_000,
        stemDurationMs: 10_250,
      }),
    ).toBeNull();
  });
  it("does not report the current file as its own duplicate", () => {
    expect(
      possibleDuplicateIssue({
        audioFileId: "same",
        matchingAudioFileIds: ["same"],
      }),
    ).toBeNull();
  });
});
