import { describe, expect, it } from "vitest";
import {
  buildCanonicalEmbeddingDocument,
  buildCanonicalEmbeddingText,
} from "./canonical-input";

describe("canonical embedding input", () => {
  const sampleTrack = {
    trackId: "cfb47b09-2b43-4a32-95ae-532d52adef15",
    title: "Morning Raga Sunrise",
    description:
      "Atmospheric classical morning raga with sitar and gentle tanpura drone.",
    descriptionCaption: "Early morning calm news lead-in",
    versionType: "original",
    versionLabel: "Main Master",
    assetKind: "music",
    bpm: 96,
    keyTonic: "C",
    keyMode: "major",
    energyScore: 0.65,
    vocalState: "instrumental",
    languageCode: null,
    era: "Contemporary",
    underDialogue: true,
    loopable: false,
    endingType: "natural_ring",
    terms: [
      {
        category: "genre",
        slug: "indian_classical",
        label: "Indian Classical",
      },
      { category: "mood", slug: "peaceful", label: "Peaceful" },
      { category: "instrument", slug: "sitar", label: "Sitar" },
    ],
  };

  it("builds a structured canonical representation of track metadata", () => {
    const text = buildCanonicalEmbeddingText(sampleTrack);

    expect(text).toContain("Title: Morning Raga Sunrise");
    expect(text).toContain("Description: Atmospheric classical morning raga");
    expect(text).toContain("Genre: Indian Classical");
    expect(text).toContain("Instrument: Sitar");
    expect(text).toContain("Mood: Peaceful");
    expect(text).toContain("Musical: 96 BPM; Key of C major");
    expect(text).toContain("Vocals: instrumental");
    expect(text).toContain("suitable under dialogue");
  });

  it("produces deterministic SHA-256 hash", () => {
    const doc1 = buildCanonicalEmbeddingDocument(sampleTrack);
    const doc2 = buildCanonicalEmbeddingDocument(sampleTrack);

    expect(doc1.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(doc1.inputHash).toBe(doc2.inputHash);
  });

  it("changes hash when metadata or accepted terms change", () => {
    const doc1 = buildCanonicalEmbeddingDocument(sampleTrack);
    const modifiedTrack = {
      ...sampleTrack,
      bpm: 120,
    };
    const doc2 = buildCanonicalEmbeddingDocument(modifiedTrack);

    expect(doc1.inputHash).not.toBe(doc2.inputHash);
  });

  it("excludes review notes and private submission fields", () => {
    const text = buildCanonicalEmbeddingText(sampleTrack);
    expect(text).not.toContain("review_notes");
    expect(text).not.toContain("rejection_reason");
    expect(text).not.toContain("secret");
  });
});
