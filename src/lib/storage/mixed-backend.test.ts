import { describe, expect, it } from "vitest";

import { parseStorageConfig } from "./config";

const ONEDRIVE_ENVIRONMENT = {
  ONEDRIVE_TENANT_ID: "tenant",
  ONEDRIVE_CLIENT_ID: "client",
  ONEDRIVE_CLIENT_SECRET: "secret",
  ONEDRIVE_SITE_ID: "site",
  ONEDRIVE_DRIVE_ID: "drive",
  ONEDRIVE_ROOT_ITEM_ID: "root",
  STORAGE_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

/**
 * Switching `STORAGE_PROVIDER` decides where new objects are written and
 * nothing about where existing ones already are. Every audio row carries its
 * own `storage_backend` for exactly that reason, and a server has to be able
 * to read both.
 */
describe("storage across a provider switch", () => {
  it("keeps a usable local root while OneDrive is the write target", () => {
    const config = parseStorageConfig({
      STORAGE_PROVIDER: "onedrive",
      ...ONEDRIVE_ENVIRONMENT,
    });
    expect(config.provider).toBe("onedrive");
    // Files written before the switch are still on disk under this root.
    expect(config.localRoot).toMatch(/soundvault-storage$/);
  });

  it("keeps OneDrive credentials usable after switching back to local", () => {
    const config = parseStorageConfig({
      STORAGE_PROVIDER: "local",
      ...ONEDRIVE_ENVIRONMENT,
    });
    expect(config.provider).toBe("local");
    // Objects written while OneDrive was the provider must stay readable.
    expect(config.oneDrive).toMatchObject({
      driveId: "drive",
      rootItemId: "root",
    });
  });

  it("does not invent partial OneDrive credentials when local is configured", () => {
    const config = parseStorageConfig({
      STORAGE_PROVIDER: "local",
      ONEDRIVE_TENANT_ID: "tenant",
      ONEDRIVE_CLIENT_ID: "client",
    });
    expect(config.oneDrive).toBeUndefined();
  });

  it("still requires complete credentials when OneDrive is the provider", () => {
    expect(() =>
      parseStorageConfig({
        STORAGE_PROVIDER: "onedrive",
        ...ONEDRIVE_ENVIRONMENT,
        ONEDRIVE_DRIVE_ID: undefined,
      }),
    ).toThrow(/ONEDRIVE_DRIVE_ID/);
  });
});
