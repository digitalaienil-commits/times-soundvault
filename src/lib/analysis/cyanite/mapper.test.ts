import { describe, expect, it } from "vitest";
import { normalizeCyaniteV7Result } from "./mapper";

describe("Cyanite V7 normalization", () => {
  it("maps bounded suggestions and segment arrays", () => {
    const result = normalizeCyaniteV7Result({
      advancedGenreTags: ["indian"],
      advancedInstrumentTags: ["tabla"],
      moodTags: ["uplifting"],
      bpmPrediction: { value: 120, confidence: 0.9 },
      keyPrediction: { value: "C major", confidence: 0.8 },
      segments: {
        timestamps: [0, 10, 20],
        valence: [0.2, 0.4],
        arousal: [0.5, 0.6],
      },
    });
    expect(result.genres).toEqual(["indian"]);
    expect(result.instruments).toEqual(["tabla"]);
    expect(result.bpm).toBe(120);
    expect(result.segments).toHaveLength(2);
  });
});
