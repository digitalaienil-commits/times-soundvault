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
  // Two limits apply at once. Microsoft Graph rejects any non-final chunk
  // that is not a multiple of 320 KiB, and a serverless platform rejects a
  // request body over its own cap — Vercel's is 4.5 MB. The default is the
  // largest multiple of 320 KiB that stays comfortably inside that cap.
  UPLOAD_CHUNK_BYTES: positiveInteger(12 * 320 * 1024),
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
  chunkBytes: number;
  oneDrive?: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    siteId: string;
    driveId: string;
    rootItemId: string;
  };
}

/**
 * Microsoft Graph requires every chunk except the last to be a multiple of
 * 320 KiB and rejects the whole transfer otherwise, so a configured size is
 * rounded down to one rather than trusted. Rounding down keeps it inside
 * whatever request-body cap the operator chose it for.
 */
const GRAPH_CHUNK_UNIT = 320 * 1024;

export function chunkBytesFrom(requested: number): number {
  const bounded = Math.min(
    Math.max(requested, GRAPH_CHUNK_UNIT),
    64 * 1024 * 1024,
  );
  return Math.floor(bounded / GRAPH_CHUNK_UNIT) * GRAPH_CHUNK_UNIT;
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
    chunkBytes: chunkBytesFrom(parsed.UPLOAD_CHUNK_BYTES),
  };
  // `storage_backend` is recorded per file, so a server whose configured
  // provider is `local` still has to read objects written to OneDrive before
  // the switch, and vice versa. The credentials are therefore accepted
  // whenever they are complete, and only *required* when OneDrive is the
  // provider that new writes go to.
  const oneDriveValues = {
    tenantId: parsed.ONEDRIVE_TENANT_ID,
    clientId: parsed.ONEDRIVE_CLIENT_ID,
    clientSecret: parsed.ONEDRIVE_CLIENT_SECRET,
    siteId: parsed.ONEDRIVE_SITE_ID,
    driveId: parsed.ONEDRIVE_DRIVE_ID,
    rootItemId: parsed.ONEDRIVE_ROOT_ITEM_ID,
  };
  if (
    parsed.STORAGE_PROVIDER !== "onedrive" &&
    Object.values(oneDriveValues).every((value) => value)
  ) {
    config.oneDrive = oneDriveValues as NonNullable<StorageConfig["oneDrive"]>;
  }
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
    chunkBytes: config.chunkBytes,
    storageDisplayLabel:
      config.provider === "onedrive"
        ? "Company SharePoint"
        : "Private local storage",
  };
}
