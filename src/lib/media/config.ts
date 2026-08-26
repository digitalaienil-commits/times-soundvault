import "server-only";

import path from "node:path";
import { z } from "zod";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const schema = z.object({
  MEDIA_TEMP_ROOT: z.string().trim().min(1).default(".soundvault-media"),
  MEDIA_PROFILE_VERSION: positiveInteger(1),
  MEDIA_PREVIEW_BITRATE_KBPS: positiveInteger(192),
  MEDIA_PREVIEW_SAMPLE_RATE_HZ: positiveInteger(48_000),
  MEDIA_WAVEFORM_PEAK_COUNT: positiveInteger(2_048),
  MEDIA_JOB_CONCURRENCY: positiveInteger(2),
  MEDIA_JOB_LEASE_MS: positiveInteger(300_000),
  MEDIA_JOB_MAX_RETRIES: positiveInteger(5),
  MEDIA_PACKAGE_RETENTION_HOURS: positiveInteger(24),
  MEDIA_PACKAGE_MAX_SOURCE_BYTES: positiveInteger(20 * 1024 ** 3),
  MEDIA_PACKAGE_MAX_FILES: positiveInteger(40),
  MEDIA_PACKAGE_BUILD_CONCURRENCY: positiveInteger(1),
  MEDIA_PACKAGE_TIMEOUT_MS: positiveInteger(1_800_000),
});

const REQUIRED_PRODUCTION_KEYS = [
  "MEDIA_TEMP_ROOT",
  "MEDIA_PROFILE_VERSION",
  "MEDIA_PREVIEW_BITRATE_KBPS",
  "MEDIA_PREVIEW_SAMPLE_RATE_HZ",
  "MEDIA_WAVEFORM_PEAK_COUNT",
  "MEDIA_JOB_CONCURRENCY",
  "MEDIA_JOB_LEASE_MS",
  "MEDIA_JOB_MAX_RETRIES",
  "MEDIA_PACKAGE_RETENTION_HOURS",
  "MEDIA_PACKAGE_MAX_SOURCE_BYTES",
  "MEDIA_PACKAGE_MAX_FILES",
  "MEDIA_PACKAGE_BUILD_CONCURRENCY",
  "MEDIA_PACKAGE_TIMEOUT_MS",
] as const;

export type MediaConfig = ReturnType<typeof parseMediaConfig>;

export function parseMediaConfig(
  raw: Readonly<Record<string, string | undefined>> = process.env,
) {
  for (const key of Object.keys(raw)) {
    if (key.startsWith("NEXT_PUBLIC_") && key.includes("MEDIA")) {
      throw new Error("Media configuration must remain server-only");
    }
  }
  if (raw.NODE_ENV === "production") {
    for (const key of REQUIRED_PRODUCTION_KEYS) {
      if (!raw[key]?.trim())
        throw new Error(`${key} is required in production`);
    }
  }
  const parsed = schema.parse(raw);
  const tempRoot = path.resolve(parsed.MEDIA_TEMP_ROOT);
  const publicRoot = path.resolve(process.cwd(), "public");
  if (
    tempRoot === publicRoot ||
    tempRoot.startsWith(`${publicRoot}${path.sep}`)
  ) {
    throw new Error("MEDIA_TEMP_ROOT must not resolve inside public");
  }
  return {
    tempRoot,
    profileVersion: parsed.MEDIA_PROFILE_VERSION,
    previewBitrateKbps: parsed.MEDIA_PREVIEW_BITRATE_KBPS,
    previewSampleRateHz: parsed.MEDIA_PREVIEW_SAMPLE_RATE_HZ,
    waveformPeakCount: parsed.MEDIA_WAVEFORM_PEAK_COUNT,
    jobConcurrency: Math.min(parsed.MEDIA_JOB_CONCURRENCY, 8),
    jobLeaseMs: parsed.MEDIA_JOB_LEASE_MS,
    jobMaxRetries: parsed.MEDIA_JOB_MAX_RETRIES,
    packageRetentionHours: parsed.MEDIA_PACKAGE_RETENTION_HOURS,
    packageMaxSourceBytes: parsed.MEDIA_PACKAGE_MAX_SOURCE_BYTES,
    packageMaxFiles: parsed.MEDIA_PACKAGE_MAX_FILES,
    packageBuildConcurrency: Math.min(
      parsed.MEDIA_PACKAGE_BUILD_CONCURRENCY,
      2,
    ),
    packageTimeoutMs: parsed.MEDIA_PACKAGE_TIMEOUT_MS,
  };
}
