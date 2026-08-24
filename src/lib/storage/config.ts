import "server-only";

import path from "node:path";

import { z } from "zod";

import { ACCEPTED_AUDIO_EXTENSIONS } from "@/types/uploads";
import type { PublicUploadConfig, StorageKind } from "@/types/uploads";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const uploadEnvironmentSchema = z.object({
  STORAGE_PROVIDER: z.enum(["local", "onedrive"]).default("local"),
  LOCAL_STORAGE_ROOT: z.string().trim().min(1).default(".soundvault-storage"),
  STORAGE_SESSION_ENCRYPTION_KEY: z.string().trim().optional(),
  UPLOAD_MAX_FILE_BYTES: positiveInteger(2 * 1024 ** 3),
  UPLOAD_MAX_BATCH_BYTES: positiveInteger(20 * 1024 ** 3),
  UPLOAD_MAX_TRACKS_PER_BATCH: positiveInteger(25),
  UPLOAD_MAX_STEMS_PER_TRACK: positiveInteger(32),
  UPLOAD_CONCURRENCY: positiveInteger(3),
  UPLOAD_ADVISORY_MAX_DURATION_SECONDS: positiveInteger(1800),
  ONEDRIVE_TENANT_ID: z.string().trim().optional(),
  ONEDRIVE_CLIENT_ID: z.string().trim().optional(),
  ONEDRIVE_CLIENT_SECRET: z.string().trim().optional(),
  ONEDRIVE_SITE_ID: z.string().trim().optional(),
  ONEDRIVE_DRIVE_ID: z.string().trim().optional(),
  ONEDRIVE_ROOT_ITEM_ID: z.string().trim().optional(),
});

export interface StorageConfig {
  provider: StorageKind;
  localRoot: string;
  sessionEncryptionKey?: string;
  maxFileBytes: number;
  maxBatchBytes: number;
  maxTracksPerBatch: number;
  maxStemsPerTrack: number;
  concurrency: number;
  advisoryMaxDurationSeconds: number;
  oneDrive?: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    siteId: string;
    driveId: string;
    rootItemId: string;
  };
}

function requiredOneDriveValue(
  value: string | undefined,
  name: string,
): string {
  if (!value) throw new Error(`${name} is required for OneDrive storage`);
  return value;
}

export function parseStorageConfig(
  raw: Readonly<Record<string, string | undefined>> = process.env,
): StorageConfig {
  for (const key of Object.keys(raw)) {
    if (key.startsWith("NEXT_PUBLIC_") && /STORAGE|ONEDRIVE/.test(key)) {
      throw new Error(
        "Storage credentials must never use NEXT_PUBLIC_ variables",
      );
    }
  }
  const parsed = uploadEnvironmentSchema.parse(raw);
  const localRoot = path.resolve(parsed.LOCAL_STORAGE_ROOT);
  const publicRoot = path.resolve(process.cwd(), "public");
  if (
    localRoot === publicRoot ||
    localRoot.startsWith(`${publicRoot}${path.sep}`)
  ) {
    throw new Error("LOCAL_STORAGE_ROOT must not resolve inside public");
  }
  const config: StorageConfig = {
    provider: parsed.STORAGE_PROVIDER,
    localRoot,
    sessionEncryptionKey: parsed.STORAGE_SESSION_ENCRYPTION_KEY,
    maxFileBytes: parsed.UPLOAD_MAX_FILE_BYTES,
    maxBatchBytes: parsed.UPLOAD_MAX_BATCH_BYTES,
    maxTracksPerBatch: parsed.UPLOAD_MAX_TRACKS_PER_BATCH,
    maxStemsPerTrack: parsed.UPLOAD_MAX_STEMS_PER_TRACK,
    concurrency: Math.min(parsed.UPLOAD_CONCURRENCY, 3),
    advisoryMaxDurationSeconds: parsed.UPLOAD_ADVISORY_MAX_DURATION_SECONDS,
  };
  if (parsed.STORAGE_PROVIDER === "onedrive") {
    const encryptionKey = parsed.STORAGE_SESSION_ENCRYPTION_KEY;
    if (!encryptionKey || Buffer.from(encryptionKey, "base64").length !== 32) {
      throw new Error(
        "STORAGE_SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
      );
    }
    config.oneDrive = {
      tenantId: requiredOneDriveValue(
        parsed.ONEDRIVE_TENANT_ID,
        "ONEDRIVE_TENANT_ID",
      ),
      clientId: requiredOneDriveValue(
        parsed.ONEDRIVE_CLIENT_ID,
        "ONEDRIVE_CLIENT_ID",
      ),
      clientSecret: requiredOneDriveValue(
        parsed.ONEDRIVE_CLIENT_SECRET,
        "ONEDRIVE_CLIENT_SECRET",
      ),
      siteId: requiredOneDriveValue(
        parsed.ONEDRIVE_SITE_ID,
        "ONEDRIVE_SITE_ID",
      ),
      driveId: requiredOneDriveValue(
        parsed.ONEDRIVE_DRIVE_ID,
        "ONEDRIVE_DRIVE_ID",
      ),
      rootItemId: requiredOneDriveValue(
        parsed.ONEDRIVE_ROOT_ITEM_ID,
        "ONEDRIVE_ROOT_ITEM_ID",
      ),
    };
  }
  return config;
}

export function toPublicUploadConfig(
  config: StorageConfig,
): PublicUploadConfig {
  return {
    acceptedExtensions: ACCEPTED_AUDIO_EXTENSIONS,
    maxFileBytes: config.maxFileBytes,
    maxBatchBytes: config.maxBatchBytes,
    maxTracksPerBatch: config.maxTracksPerBatch,
    maxStemsPerTrack: config.maxStemsPerTrack,
    concurrency: config.concurrency,
    advisoryMaxDurationSeconds: config.advisoryMaxDurationSeconds,
    storageDisplayLabel:
      config.provider === "onedrive"
        ? "Company SharePoint"
        : "Private local storage",
  };
}
