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
