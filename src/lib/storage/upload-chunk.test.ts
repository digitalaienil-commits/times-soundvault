import { describe, expect, it } from "vitest";

import { parseStorageConfig, toPublicUploadConfig } from "./config";

/**
 * The browser splits a transfer into requests of this size. A serverless host
 * rejects a body above its own limit — Vercel's is 4.5 MB — and the transfer
 * dies on its first chunk, so the default has to fit inside the smallest
 * platform this deploys to.
 */
describe("upload chunk size", () => {
  it("defaults below the serverless request body limit", () => {
    const config = parseStorageConfig({ STORAGE_PROVIDER: "local" });
    expect(config.chunkBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  it("reaches the browser, which cannot otherwise know it", () => {
    const config = toPublicUploadConfig(
      parseStorageConfig({ STORAGE_PROVIDER: "local" }),
    );
    expect(config.chunkBytes).toBeGreaterThan(0);
  });

  it("can be raised on a host with no such limit", () => {
    const config = parseStorageConfig({
      STORAGE_PROVIDER: "local",
      UPLOAD_CHUNK_BYTES: String(16 * 1024 * 1024),
    });
    expect(config.chunkBytes).toBe(16 * 1024 * 1024);
  });

  it("clamps values that would stall or overwhelm a transfer", () => {
    expect(
      parseStorageConfig({
        STORAGE_PROVIDER: "local",
        UPLOAD_CHUNK_BYTES: "1024",
      }).chunkBytes,
    ).toBeGreaterThanOrEqual(256 * 1024);
    expect(
      parseStorageConfig({
        STORAGE_PROVIDER: "local",
        UPLOAD_CHUNK_BYTES: String(1024 ** 3),
      }).chunkBytes,
    ).toBeLessThanOrEqual(64 * 1024 * 1024);
  });
});
