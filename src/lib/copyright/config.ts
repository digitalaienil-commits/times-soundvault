import { z } from "zod";

const copyrightConfigSchema = z.object({
  provider: z.literal("manual_youtube").default("manual_youtube"),
  root: z.string().trim().min(1).default(".soundvault-copyright"),
  maxTracks: z.coerce.number().int().min(1).max(100).default(20),
  maxDurationSeconds: z.coerce.number().int().min(60).default(5400),
  gapSeconds: z.coerce.number().int().min(0).max(30).default(2),
  retentionDays: z.coerce.number().int().min(1).max(30).default(7),
  buildConcurrency: z.coerce.number().int().min(1).max(4).default(1),
  leaseMs: z.coerce.number().int().min(30_000).default(300_000),
  fileTimeoutMs: z.coerce.number().int().min(10_000).default(1_800_000),
});

export function parseCopyrightConfig(environment = process.env) {
  return copyrightConfigSchema.parse({
    provider: environment.COPYRIGHT_PROVIDER,
    root: environment.COPYRIGHT_TEMP_ROOT,
    maxTracks: environment.COPYRIGHT_BATCH_MAX_TRACKS,
    maxDurationSeconds: environment.COPYRIGHT_BATCH_MAX_DURATION_SECONDS,
    gapSeconds: environment.COPYRIGHT_BATCH_GAP_SECONDS,
    retentionDays: environment.COPYRIGHT_BATCH_ARTIFACT_RETENTION_DAYS,
    buildConcurrency: environment.COPYRIGHT_BATCH_BUILD_CONCURRENCY,
    leaseMs: environment.COPYRIGHT_JOB_LEASE_MS,
    fileTimeoutMs: environment.COPYRIGHT_BATCH_TIMEOUT_MS,
  });
}
