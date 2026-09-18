import { describe, expect, it } from "vitest";

import {
  chunkBytesFrom,
  parseStorageConfig,
  toPublicUploadConfig,
} from "./config";
import { assertValidOneDriveChunkSize } from "./onedrive/provider";

const GRAPH_UNIT = 320 * 1024;

/**
 * Two limits apply to the same number and missing either breaks every upload.
 *
 * Microsoft Graph rejects a non-final chunk that is not a multiple of 320 KiB,
 * so a size chosen only to fit a serverless request cap fails on the first
 * chunk. A 4 MiB default did exactly that: inside Vercel's 4.5 MB body limit,
 * and 12.8 units of 320 KiB.
 */
describe("upload chunk size", () => {
  it("is a size Microsoft Graph will accept", () => {
    const config = parseStorageConfig({ STORAGE_PROVIDER: "local" });
    expect(config.chunkBytes % GRAPH_UNIT).toBe(0);
    expect(() => assertValidOneDriveChunkSize(config.chunkBytes)).not.toThrow();
  });

  it("stays below the serverless request body limit", () => {
    const config = parseStorageConfig({ STORAGE_PROVIDER: "local" });
    expect(config.chunkBytes).toBeLessThan(4.5 * 1000 * 1000);
  });

  it("reaches the browser, which cannot otherwise know it", () => {
    const config = toPublicUploadConfig(
      parseStorageConfig({ STORAGE_PROVIDER: "local" }),
    );
    expect(config.chunkBytes).toBeGreaterThan(0);
  });

  it("rounds a configured size down to a size Graph accepts", () => {
    // Rounding down rather than up keeps it inside whatever request cap the
    // operator picked the number for.
    expect(chunkBytesFrom(4 * 1024 * 1024)).toBe(12 * GRAPH_UNIT);
    expect(chunkBytesFrom(10 * 1024 * 1024)).toBe(32 * GRAPH_UNIT);
    expect(chunkBytesFrom(GRAPH_UNIT * 3 + 1)).toBe(3 * GRAPH_UNIT);
  });

  it("never produces a size below one Graph unit or above the ceiling", () => {
    expect(chunkBytesFrom(1)).toBe(GRAPH_UNIT);
    expect(chunkBytesFrom(1024 ** 3)).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(chunkBytesFrom(1024 ** 3) % GRAPH_UNIT).toBe(0);
  });

  it("keeps an operator override usable", () => {
    const config = parseStorageConfig({
      STORAGE_PROVIDER: "local",
      UPLOAD_CHUNK_BYTES: String(10 * 1024 * 1024),
    });
    expect(config.chunkBytes).toBe(10 * 1024 * 1024);
    expect(() => assertValidOneDriveChunkSize(config.chunkBytes)).not.toThrow();
  });
});
