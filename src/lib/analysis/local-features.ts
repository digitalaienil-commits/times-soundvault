import "server-only";

import { createRequire } from "node:module";

import { decodeMonoPcmForAnalysis } from "@/lib/audio/pcm";

interface EssentiaVector {
  delete?: () => void;
}

interface EssentiaInstance {
  version?: string;
  arrayToVector(input: Float32Array): EssentiaVector;
  RMS(input: EssentiaVector): { rms?: number };
  Energy(input: EssentiaVector): { energy?: number };
  DynamicComplexity(input: EssentiaVector): {
    dynamicComplexity?: number;
    loudness?: number;
  };
  Danceability(input: EssentiaVector): {
    danceability?: number;
    confidence?: number;
    dfa?: EssentiaVector;
  };
  KeyExtractor(
    input: EssentiaVector,
    averageDetuningCorrection: boolean,
    frameSize: number,
    hopSize: number,
    hpcpSize: number,
    maxFrequency: number,
    maximumSpectralPeaks: number,
    minFrequency: number,
    pcpThreshold: number,
    profileType: string,
    sampleRate: number,
    spectralPeaksThreshold: number,
    tuningFrequency: number,
    weightType: string,
    windowType: string,
  ): { key?: string; scale?: string; strength?: number };
  RhythmExtractor2013(input: EssentiaVector): {
    bpm?: number;
    confidence?: number;
    ticks?: EssentiaVector;
    estimates?: EssentiaVector;
    bpmIntervals?: EssentiaVector;
  };
  SpectralCentroidTime(
    input: EssentiaVector,
    sampleRate: number,
  ): {
    centroid?: number;
  };
  ZeroCrossingRate(input: EssentiaVector): { zeroCrossingRate?: number };
  Windowing(input: EssentiaVector): { frame?: EssentiaVector };
  Spectrum(input: EssentiaVector): { spectrum?: EssentiaVector };
  Flatness(input: EssentiaVector): { flatness?: number };
  shutdown?: () => void;
}

interface EssentiaPackage {
  EssentiaWASM: unknown;
  Essentia: new (wasm: unknown) => EssentiaInstance;
}

export interface LocalMusicFeatures {
  source: "essentia.js";
  essentiaVersion: string | null;
  sampleRateHz: number;
  analyzedDurationMs: number;
  bpm: number | null;
  bpmConfidence: number | null;
  key: string | null;
  keyScale: string | null;
  keyStrength: number | null;
  danceability: number | null;
  danceabilityConfidence: number | null;
  dynamicComplexity: number | null;
  loudness: number | null;
  rms: number | null;
  energy: number | null;
  spectralCentroidHz: number | null;
  spectralFlatness: number | null;
  zeroCrossingRate: number | null;
}

function finiteNumber(value: unknown, decimals = 4): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function finiteText(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 80)
    : null;
}

function dispose(...vectors: Array<EssentiaVector | undefined>) {
  for (const vector of vectors) vector?.delete?.();
}

function loadEssentia(): EssentiaPackage {
  const require = createRequire(import.meta.url);
  return require("essentia.js") as EssentiaPackage;
}

/**
 * Spectral flatness over real analysis frames.
 *
 * `Spectrum` performs an FFT over whatever it is given. Passing a whole track
 * returned a meaningless 0 for medium files and aborted the Essentia
 * WebAssembly heap on longer ones, which failed AI analysis for real uploads.
 * Averaging evenly spaced frames is both safe and actually representative.
 */
const FLATNESS_FRAME_SIZE = 2048;
const FLATNESS_FRAME_COUNT = 16;

function averageSpectralFlatness(
  essentia: EssentiaInstance,
  signal: Float32Array,
): number | null {
  if (signal.length < FLATNESS_FRAME_SIZE) return null;

  const usableFrames = Math.floor(signal.length / FLATNESS_FRAME_SIZE);
  const frameCount = Math.min(FLATNESS_FRAME_COUNT, usableFrames);
  const stride = Math.floor(usableFrames / frameCount);
  let total = 0;
  let counted = 0;

  for (let index = 0; index < frameCount; index += 1) {
    const start = index * stride * FLATNESS_FRAME_SIZE;
    let frameVector: EssentiaVector | undefined;
    let windowedFrame: EssentiaVector | undefined;
    let spectrum: EssentiaVector | undefined;
    try {
      frameVector = essentia.arrayToVector(
        signal.slice(start, start + FLATNESS_FRAME_SIZE),
      );
      windowedFrame = essentia.Windowing(frameVector).frame;
      if (!windowedFrame) continue;
      spectrum = essentia.Spectrum(windowedFrame).spectrum;
      if (!spectrum) continue;
      const flatness = essentia.Flatness(spectrum).flatness;
      if (typeof flatness === "number" && Number.isFinite(flatness)) {
        total += flatness;
        counted += 1;
      }
    } finally {
      dispose(spectrum, windowedFrame, frameVector);
    }
  }

  return counted > 0 ? total / counted : null;
}

export function extractEssentiaFeaturesFromSignal(
  signal: Float32Array,
  sampleRateHz: number,
  analyzedDurationMs: number,
): LocalMusicFeatures {
  if (signal.length < sampleRateHz / 2) {
    throw new Error("Audio is too short for local music feature extraction");
  }

  const essentiaPackage = loadEssentia();
  const essentia = new essentiaPackage.Essentia(essentiaPackage.EssentiaWASM);
  const vector = essentia.arrayToVector(signal);
  let danceDfa: EssentiaVector | undefined;
  let rhythmTicks: EssentiaVector | undefined;
  let rhythmEstimates: EssentiaVector | undefined;
  let rhythmIntervals: EssentiaVector | undefined;

  try {
    const rhythm = essentia.RhythmExtractor2013(vector);
    rhythmTicks = rhythm.ticks;
    rhythmEstimates = rhythm.estimates;
    rhythmIntervals = rhythm.bpmIntervals;

    const key = essentia.KeyExtractor(
      vector,
      true,
      4096,
      4096,
      12,
      3500,
      60,
      25,
      0.2,
      "bgate",
      sampleRateHz,
      0.0001,
      440,
      "cosine",
      "hann",
    );

    const dance = essentia.Danceability(vector);
    danceDfa = dance.dfa;
    const dynamic = essentia.DynamicComplexity(vector);

    return {
      source: "essentia.js",
      essentiaVersion: essentia.version ?? null,
      sampleRateHz,
      analyzedDurationMs,
      bpm: finiteNumber(rhythm.bpm, 2),
      bpmConfidence: finiteNumber(rhythm.confidence, 4),
      key: finiteText(key.key),
      keyScale: finiteText(key.scale),
      keyStrength: finiteNumber(key.strength, 4),
      danceability: finiteNumber(dance.danceability, 4),
      danceabilityConfidence: finiteNumber(dance.confidence, 4),
      dynamicComplexity: finiteNumber(dynamic.dynamicComplexity, 4),
      loudness: finiteNumber(dynamic.loudness, 2),
      rms: finiteNumber(essentia.RMS(vector).rms, 6),
      energy: finiteNumber(essentia.Energy(vector).energy, 2),
      spectralCentroidHz: finiteNumber(
        essentia.SpectralCentroidTime(vector, sampleRateHz).centroid,
        2,
      ),
      spectralFlatness: finiteNumber(
        averageSpectralFlatness(essentia, signal),
        6,
      ),
      zeroCrossingRate: finiteNumber(
        essentia.ZeroCrossingRate(vector).zeroCrossingRate,
        6,
      ),
    };
  } finally {
    dispose(danceDfa, rhythmTicks, rhythmEstimates, rhythmIntervals, vector);
    essentia.shutdown?.();
  }
}

export async function extractLocalMusicFeatures(
  filePath: string,
  options: {
    sampleRateHz: number;
    maxDurationSeconds: number;
    timeoutMs: number;
  },
): Promise<LocalMusicFeatures> {
  const decoded = await decodeMonoPcmForAnalysis(filePath, options);
  return extractEssentiaFeaturesFromSignal(
    decoded.signal,
    decoded.sampleRateHz,
    decoded.analyzedDurationMs,
  );
}
