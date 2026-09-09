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

  it("extracts features from a full-length signal without aborting Essentia", () => {
    // Spectral analysis used to run one FFT over the whole track. That
    // returned a meaningless 0 at this length and aborted the Essentia
    // WebAssembly heap outright on longer uploads, failing AI analysis. Only
    // the short fixture above ever produced a usable value.
    const sampleRateHz = 22050;
    const durationSeconds = 60;
    const signal = new Float32Array(sampleRateHz * durationSeconds);
    for (let index = 0; index < signal.length; index += 1) {
      const time = index / sampleRateHz;
      signal[index] =
        Math.sin(2 * Math.PI * 220 * time) * 0.25 +
        Math.sin(2 * Math.PI * 331 * time) * 0.15;
    }

    const features = extractEssentiaFeaturesFromSignal(
      signal,
      sampleRateHz,
      durationSeconds * 1000,
    );

    expect(features.spectralFlatness).not.toBeNull();
    expect(features.spectralFlatness).toBeGreaterThan(0);
    expect(features.spectralFlatness).toBeLessThanOrEqual(1);
    expect(features.rms).toBeGreaterThan(0);
  });
});
