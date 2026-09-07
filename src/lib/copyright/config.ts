import { z } from "zod";

const copyrightConfigSchema = z.object({
  provider: z
    .enum(["manual_youtube", "youtube_content_id"])
    .default("manual_youtube"),
  root: z.string().trim().min(1).default(".soundvault-copyright"),
  maxTracks: z.coerce.number().int().min(1).max(100).default(20),
  maxDurationSeconds: z.coerce.number().int().min(60).default(5400),
  gapSeconds: z.coerce.number().int().min(0).max(30).default(2),
  retentionDays: z.coerce.number().int().min(1).max(30).default(7),
  buildConcurrency: z.coerce.number().int().min(1).max(4).default(1),
  leaseMs: z.coerce.number().int().min(30_000).default(300_000),
  fileTimeoutMs: z.coerce.number().int().min(10_000).default(1_800_000),
  youtubeContentOwnerId: z.string().trim().optional(),
  youtubeClientId: z.string().trim().optional(),
  youtubeClientSecret: z.string().trim().optional(),
  youtubeRefreshToken: z.string().trim().optional(),
  youtubeTestChannelId: z.string().trim().optional(),
  youtubeDryRun: z.boolean().default(true),
  youtubePollTimeoutMs: z.coerce.number().int().min(5000).default(180_000),
  youtubePollIntervalMs: z.coerce.number().int().min(1000).default(10_000),
});

export type CopyrightConfig = z.infer<typeof copyrightConfigSchema>;

export function parseCopyrightConfig(
  environment: NodeJS.ProcessEnv = process.env,
): CopyrightConfig {
  for (const key of Object.keys(environment)) {
    if (
      key.startsWith("NEXT_PUBLIC_") &&
      /COPYRIGHT|YOUTUBE|CONTENT_ID/.test(key)
    ) {
      throw new Error(
        "Copyright credentials must never use NEXT_PUBLIC_ variables",
      );
    }
  }

  const dryRun =
    environment.YOUTUBE_CONTENT_ID_DRY_RUN !== "false" &&
    environment.YOUTUBE_DRY_RUN !== "false";

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
    youtubeContentOwnerId: environment.YOUTUBE_CONTENT_OWNER_ID,
    youtubeClientId: environment.YOUTUBE_CLIENT_ID,
    youtubeClientSecret: environment.YOUTUBE_CLIENT_SECRET,
    youtubeRefreshToken: environment.YOUTUBE_REFRESH_TOKEN,
    youtubeTestChannelId: environment.YOUTUBE_TEST_CHANNEL_ID,
    youtubeDryRun: dryRun,
    youtubePollTimeoutMs: environment.YOUTUBE_CLAIM_POLL_TIMEOUT_MS,
    youtubePollIntervalMs: environment.YOUTUBE_CLAIM_POLL_INTERVAL_MS,
  });
}
