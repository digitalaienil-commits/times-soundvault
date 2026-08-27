import "server-only";

import type { QueryResultRow } from "pg";

import { getDatabase } from "@/lib/database/database";
import { parseMediaConfig } from "@/lib/media/config";

export interface RetentionPreview {
  expiredDownloadPackages: number;
  failedPlaybackArtifacts: number;
  queuedCleanupJobs: number;
  policyNote: string;
}

export async function getRetentionPreview(): Promise<RetentionPreview> {
  const mediaConfig = parseMediaConfig();
  const result = await getDatabase().query<
    {
      expired_packages: string;
      failed_artifacts: string;
      cleanup_jobs: string;
    } & QueryResultRow
  >(
    `SELECT
       (SELECT count(*)::text FROM media.download_package
        WHERE expires_at IS NOT NULL AND expires_at < now()
          AND status IN ('ready','expired','failed','cancelled')) AS expired_packages,
       (SELECT count(*)::text FROM media.playback_artifact
        WHERE status = 'failed') AS failed_artifacts,
       (SELECT count(*)::text FROM system.maintenance_job
        WHERE job_type IN ('retention_dry_run','retention_cleanup')
          AND status IN ('queued','running')) AS cleanup_jobs`,
  );
  const row = result.rows[0];
  return {
    expiredDownloadPackages: Number(row?.expired_packages ?? 0),
    failedPlaybackArtifacts: Number(row?.failed_artifacts ?? 0),
    queuedCleanupJobs: Number(row?.cleanup_jobs ?? 0),
    policyNote: `Download packages currently retain derived ZIP artifacts for ${mediaConfig.packageRetentionHours} hours. Masters, Stems, published source files, audit rows, and workflow history are protected.`,
  };
}
