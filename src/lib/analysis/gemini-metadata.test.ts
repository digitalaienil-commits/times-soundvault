import { describe, expect, it } from "vitest";

import type { AudioMeasurements } from "@/lib/audio/ffmpeg";
import type { ProbedAudio } from "@/lib/audio/ffprobe";
import type { ProcessingSourceFile } from "@/lib/processing/repository";

import { buildLocalMetadataFallback } from "./gemini-metadata";
import type { LocalMusicFeatures } from "./local-features";

const source: ProcessingSourceFile = {
  audioFileId: "audio-1",
  assetId: "asset-1",
  submissionId: "submission-1",
  submissionRevisionId: "revision-1",
  trackId: "track-1",
  ownerUserId: "user-1",
  assetRole: "master",
  stemType: null,
  displayTitle: "Morning Drive",
  originalFilename: "morning-drive.wav",
  storageBackend: "local",
  storageKey: "private/morning-drive.wav",
  providerDriveId: null,
  providerItemId: null,
  byteSize: 1024,
  extension: ".wav",
};

const probe: ProbedAudio = {
  durationMs: 120000,
  containerFormat: "wav",
  codec: "pcm_s16le",
  bitRateBps: 1411200,
  sampleRateHz: 44100,
  bitDepth: 16,
  channels: 2,
  channelLayout: "stereo",
  embeddedTags: { title: "Morning Drive", genre: "Promo; News" },
  audioStreamCount: 1,
};

const measurements: AudioMeasurements = {
  integratedLoudnessLufs: -16,
  loudnessRangeLu: 5,
  truePeakDbtp: -1,
  samplePeakDbfs: -1.5,
  leadingSilenceMs: 120,
  trailingSilenceMs: 200,
};

const features: LocalMusicFeatures = {
  source: "essentia.js",
  essentiaVersion: "2.1",
  sampleRateHz: 22050,
  analyzedDurationMs: 120000,
  bpm: 124,
  bpmConfidence: 0.7,
  key: "C",
  keyScale: "major",
  keyStrength: 0.8,
  danceability: 1.1,
  danceabilityConfidence: 0.6,
  dynamicComplexity: 0.2,
  loudness: -16,
  rms: 0.19,
  energy: 10,
  spectralCentroidHz: 1200,
  spectralFlatness: 0.1,
  zeroCrossingRate: 0.02,
};

describe("Gemini metadata fallback", () => {
  it("builds usable metadata from local FFmpeg and Essentia facts", () => {
    const fallback = buildLocalMetadataFallback({
      source,
      probe,
      measurements,
      features,
    });

    expect(fallback.genres).toEqual(["Promo", "News"]);
    expect(fallback.bpm).toBe(124);
    expect(fallback.key).toBe("C major");
    expect(fallback.energy).toBe("high");
    expect(fallback.transformerCaption).toContain("Morning Drive");
  });
});
