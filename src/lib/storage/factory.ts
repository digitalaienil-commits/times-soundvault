import "server-only";

import type { StorageProvider } from "./provider";
import { LocalStorageProvider } from "./local/provider";
import { OneDriveStorageProvider } from "./onedrive/provider";
import { parseStorageConfig } from "./config";

export function createStorageProvider(): StorageProvider {
  const config = parseStorageConfig();
  if (config.provider === "local")
    return new LocalStorageProvider(config.localRoot);
  if (!config.oneDrive)
    throw new Error("OneDrive storage configuration is incomplete");
  return new OneDriveStorageProvider(config.oneDrive);
}

/**
 * Builds a provider for the backend a stored object actually lives on.
 *
 * Every audio row records its own `storage_backend`, because switching
 * `STORAGE_PROVIDER` changes where new writes go and nothing about where old
 * objects are. This used to return the configured provider and throw when the
 * kinds disagreed, which meant the moment the switch was flipped every file
 * written before it stopped being readable. Read the backend the row names.
 */
export function createStorageProviderForKind(
  kind: "local" | "onedrive",
): StorageProvider {
  const config = parseStorageConfig();
  if (kind === "local") return new LocalStorageProvider(config.localRoot);
  if (!config.oneDrive) {
    throw new Error(
      "This object is stored in OneDrive, but OneDrive credentials are not configured on this server",
    );
  }
  return new OneDriveStorageProvider(config.oneDrive);
}
