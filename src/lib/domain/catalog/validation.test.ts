import { describe, expect, it } from "vitest";

import {
  canonicalMetadataInputSchema,
  copyrightStatusSchema,
  metadataAnalysisStatusSchema,
  normalizeExternalIdentifier,
  normalizeIsrc,
  normalizeIswc,
  normalizeStemType,
  parseIsrc,
  publicationStatusSchema,
} from "./validation";

describe("catalog domain validation", () => {
  it("normalizes and validates ISRC without manufacturing one", () => {
    expect(normalizeIsrc(" us-abc-12-34567 ")).toBe("USABC1234567");
    expect(parseIsrc("US ABC 12 34567")).toBe("USABC1234567");
    expect(() => parseIsrc("not-an-isrc")).toThrowError(/12-character/);
  });

  it("normalizes optional Composition and custom identifiers", () => {
    expect(normalizeIswc(" T-123.456.789-0 ")).toBe("T1234567890");
    expect(normalizeExternalIdentifier("  legacy-42  ")).toBe("legacy-42");
    expect(() => normalizeExternalIdentifier("   ")).toThrowError(/empty/);
  });

  it("normalizes open stem terminology into stable tokens", () => {
    expect(normalizeStemType(" Lead Vocals / Double ")).toBe(
      "lead_vocals_double",
    );
    expect(() => normalizeStemType("---")).toThrowError(/letters or numbers/);
  });

  it("validates canonical scores, BPM and independent status axes", () => {
    expect(
      canonicalMetadataInputSchema.parse({
        bpm: 120,
        energyScore: 0.75,
        vocalState: "mixed",
      }),
    ).toMatchObject({ bpm: 120, energyScore: 0.75 });
    expect(() => canonicalMetadataInputSchema.parse({ bpm: 0 })).toThrow();
    expect(() =>
      canonicalMetadataInputSchema.parse({ valence: 1.1 }),
    ).toThrow();
    expect(publicationStatusSchema.parse("published")).toBe("published");
    expect(metadataAnalysisStatusSchema.parse("processing")).toBe("processing");
    expect(copyrightStatusSchema.parse("manual_review")).toBe("manual_review");
    expect(() => publicationStatusSchema.parse("copyright_clear")).toThrow();
  });
});
