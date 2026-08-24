import "server-only";

import path from "node:path";

import { z } from "zod";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const processingEnvironmentSchema = z.object({
  PROCESSING_TEMP_ROOT: z
    .string()
    .trim()
    .min(1)
    .default(".soundvault-processing"),
  PROCESSING_CONCURRENCY: positiveInteger(2),
  PROCESSING_FILE_TIMEOUT_MS: positiveInteger(600_000),
  PROCESSING_LEASE_MS: positiveInteger(300_000),
  PROCESSING_MAX_RETRIES: positiveInteger(5),
  PROCESSING_LEADING_SILENCE_WARNING_MS: positiveInteger(2_000),
  PROCESSING_TRAILING_SILENCE_WARNING_MS: positiveInteger(3_000),
});

export interface ProcessingConfig {
  tempRoot: string;
  concurrency: number;
  fileTimeoutMs: number;
  leaseMs: number;
  maxRetries: number;
  leadingSilenceWarningMs: number;
  trailingSilenceWarningMs: number;
}

export function parseProcessingConfig(
  raw: Readonly<Record<string, string | undefined>> = process.env,
): ProcessingConfig {
  for (const key of Object.keys(raw)) {
    if (key.startsWith("NEXT_PUBLIC_") && /PROCESSING|CYANITE/.test(key)) {
      throw new Error(
        "Processing and Cyanite configuration must never use NEXT_PUBLIC_ variables",
      );
    }
  }
  const parsed = processingEnvironmentSchema.parse(raw);
  const tempRoot = path.resolve(parsed.PROCESSING_TEMP_ROOT);
  const publicRoot = path.resolve(process.cwd(), "public");
  if (
    tempRoot === publicRoot ||
    tempRoot.startsWith(`${publicRoot}${path.sep}`)
  ) {
    throw new Error("PROCESSING_TEMP_ROOT must not resolve inside public");
  }
  return {
    tempRoot,
    concurrency: Math.min(parsed.PROCESSING_CONCURRENCY, 8),
    fileTimeoutMs: parsed.PROCESSING_FILE_TIMEOUT_MS,
    leaseMs: parsed.PROCESSING_LEASE_MS,
    maxRetries: parsed.PROCESSING_MAX_RETRIES,
    leadingSilenceWarningMs: parsed.PROCESSING_LEADING_SILENCE_WARNING_MS,
    trailingSilenceWarningMs: parsed.PROCESSING_TRAILING_SILENCE_WARNING_MS,
  };
}
