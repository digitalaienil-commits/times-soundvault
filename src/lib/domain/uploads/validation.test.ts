import { describe, expect, it } from "vitest";

import {
  createUploadBatchSchema,
  uploadFileInputSchema,
  validateUploadBatchLimits,
} from "./validation";

const master = {
  clientId: "master-1",
  originalFilename: "Theme_MASTER.wav",
  byteSize: 100,
  claimedMime: "audio/wav",
  extension: ".wav" as const,
  role: "master" as const,
  sortOrder: 0,
};

const input = {
  idempotencyKey: "request-123456",
  acknowledgementAccepted: false,
  packages: [
    {
      clientId: "track-1",
      workingTitle: "Theme",
      files: [master],
      producerMetadata: { workingTitle: "Theme" },
      rights: {
        masterRightsBasis: "unknown" as const,
        compositionRightsBasis: "unknown" as const,
      },
    },
  ],
};

describe("upload request validation", () => {
  it("accepts zero optional metadata with one Master", () => {
    expect(createUploadBatchSchema.parse(input).packages[0]?.workingTitle).toBe(
      "Theme",
    );
  });

  it("rejects unsupported, double-extension, zero-byte and unsafe filenames", () => {
    for (const candidate of [
      { ...master, originalFilename: "track.exe.wav" },
      { ...master, originalFilename: "../track.wav" },
      { ...master, byteSize: 0 },
      { ...master, originalFilename: "track.flac", extension: ".wav" },
    ]) {
      expect(() => uploadFileInputSchema.parse(candidate)).toThrow();
    }
  });

  it("requires labels for Other Stems and exactly one Master", () => {
    expect(() =>
      uploadFileInputSchema.parse({
        ...master,
        role: "stem",
        stemType: "other",
      }),
    ).toThrow();
    expect(() =>
      validateUploadBatchLimits(
        {
          ...input,
          packages: [
            {
              ...input.packages[0]!,
              files: [{ ...master, role: "stem", stemType: "bass" }],
            },
          ],
        } as never,
        {
          maxFileBytes: 1000,
          maxBatchBytes: 1000,
          maxTracksPerBatch: 25,
          maxStemsPerTrack: 32,
        },
      ),
    ).toThrow(/exactly one master/i);
  });

  it("enforces file, Track, Stem and batch limits", () => {
    expect(() =>
      validateUploadBatchLimits(input as never, {
        maxFileBytes: 99,
        maxBatchBytes: 1000,
        maxTracksPerBatch: 25,
        maxStemsPerTrack: 32,
      }),
    ).toThrow(/file is too large/i);
    expect(() =>
      validateUploadBatchLimits(input as never, {
        maxFileBytes: 1000,
        maxBatchBytes: 99,
        maxTracksPerBatch: 25,
        maxStemsPerTrack: 32,
      }),
    ).toThrow(/batch is too large/i);
    expect(() =>
      validateUploadBatchLimits(input as never, {
        maxFileBytes: 1000,
        maxBatchBytes: 1000,
        maxTracksPerBatch: 0,
        maxStemsPerTrack: 32,
      }),
    ).toThrow(/at most 0 tracks/i);
  });
});
