import { describe, expect, it } from "vitest";

import { parseAiAnalysisConfig } from "./config";

describe("AI analysis configuration", () => {
  it("uses Gemini metadata analysis when a server-side key is available", () => {
    expect(parseAiAnalysisConfig({ GEMINI_API_KEY: "test-key" })).toMatchObject(
      {
        enabled: true,
        model: "gemini-3.5-flash-lite",
        fallbackModels: ["gemini-3.5-flash", "gemini-3.1-flash-lite"],
        sampleRateHz: 22050,
        maxDurationSeconds: 180,
        geminiApiKey: "test-key",
      },
    );
  });

  it("rejects browser-exposed Gemini or Essentia settings", () => {
    expect(() =>
      parseAiAnalysisConfig({ NEXT_PUBLIC_GEMINI_API_KEY: "secret" }),
    ).toThrow(/never/);
    expect(() =>
      parseAiAnalysisConfig({ NEXT_PUBLIC_ESSENTIA_SAMPLE_RATE_HZ: "22050" }),
    ).toThrow(/never/);
  });
});
