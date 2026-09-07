import { describe, expect, it } from "vitest";

import { extractEssentiaFeaturesFromSignal } from "./local-features";

describe("local Essentia feature extraction", () => {
  it("extracts technical music features from an in-memory signal", () => {
    const sampleRateHz = 22050;
    const durationSeconds = 2;
    const signal = new Float32Array(sampleRateHz * durationSeconds);
    for (let index = 0; index < signal.length; index += 1) {
      signal[index] =
        Math.sin((2 * Math.PI * 440 * index) / sampleRateHz) * 0.2;
    }

    const features = extractEssentiaFeaturesFromSignal(
      signal,
      sampleRateHz,
      durationSeconds * 1000,
    );

    expect(features.source).toBe("essentia.js");
    expect(features.essentiaVersion).toBeTruthy();
    expect(features.sampleRateHz).toBe(sampleRateHz);
    expect(features.analyzedDurationMs).toBe(2000);
    expect(features.rms).toBeGreaterThan(0);
    expect(features.energy).toBeGreaterThan(0);
    expect(features.spectralCentroidHz).toBeGreaterThan(0);
    expect(features.zeroCrossingRate).toBeGreaterThan(0);
  });
});
