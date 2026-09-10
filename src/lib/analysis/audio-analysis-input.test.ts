import { describe, expect, it } from "vitest";

import { parseAiAnalysisConfig } from "./config";

describe("AI analysis audio excerpt configuration", () => {
  it("sends audio by default so the model hears the track", () => {
    const config = parseAiAnalysisConfig({});
    expect(config.audioEnabled).toBe(true);
    expect(config.audioMaxSeconds).toBeGreaterThan(0);
    expect(config.audioBitrateKbps).toBeGreaterThan(0);
  });

  it("can be turned off without disabling analysis entirely", () => {
    const config = parseAiAnalysisConfig({
      AI_ANALYSIS_AUDIO_ENABLED: "false",
    });
    expect(config.audioEnabled).toBe(false);
    expect(config.enabled).toBe(true);
  });

  it("bounds the excerpt so one long Master cannot dominate provider cost", () => {
    const config = parseAiAnalysisConfig({
      AI_ANALYSIS_AUDIO_MAX_SECONDS: "99999",
      AI_ANALYSIS_AUDIO_BITRATE_KBPS: "99999",
      AI_ANALYSIS_AUDIO_MAX_BYTES: "999999999",
      AI_ANALYSIS_AUDIO_SAMPLE_RATE_HZ: "999999",
    });
    expect(config.audioMaxSeconds).toBeLessThanOrEqual(600);
    expect(config.audioBitrateKbps).toBeLessThanOrEqual(320);
    expect(config.audioMaxBytes).toBeLessThanOrEqual(20 * 1024 * 1024);
    expect(config.audioSampleRateHz).toBeLessThanOrEqual(48_000);
  });

  it("still rejects public environment variables", () => {
    expect(() =>
      parseAiAnalysisConfig({ NEXT_PUBLIC_AI_ANALYSIS_AUDIO_ENABLED: "true" }),
    ).toThrow(/NEXT_PUBLIC_/);
  });
});
