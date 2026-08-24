import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseStorageConfig, toPublicUploadConfig } from "./config";

describe("storage configuration", () => {
  it("uses safe local defaults and exposes only public limits", () => {
    const config = parseStorageConfig({ STORAGE_PROVIDER: "local" });
    expect(config.provider).toBe("local");
    expect(toPublicUploadConfig(config)).toMatchObject({
      acceptedExtensions: [".wav", ".mp3"],
      concurrency: 3,
      storageDisplayLabel: "Private local storage",
    });
    expect(toPublicUploadConfig(config)).not.toHaveProperty("localRoot");
  });
  it("rejects public roots, unknown providers, public secrets and incomplete OneDrive config", () => {
    expect(() =>
      parseStorageConfig({
        STORAGE_PROVIDER: "local",
        LOCAL_STORAGE_ROOT: path.join(process.cwd(), "public", "uploads"),
      }),
    ).toThrow(/inside public/i);
    expect(() => parseStorageConfig({ STORAGE_PROVIDER: "other" })).toThrow();
    expect(() =>
      parseStorageConfig({
        STORAGE_PROVIDER: "local",
        NEXT_PUBLIC_STORAGE_SECRET: "bad",
      }),
    ).toThrow(/NEXT_PUBLIC/i);
    expect(() => parseStorageConfig({ STORAGE_PROVIDER: "onedrive" })).toThrow(
      /encryption/i,
    );
    expect(() =>
      parseStorageConfig({
        STORAGE_PROVIDER: "onedrive",
        STORAGE_SESSION_ENCRYPTION_KEY: "x".repeat(44),
      }),
    ).toThrow(/encryption/i);
  });
});
