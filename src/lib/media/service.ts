import "server-only";

import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { getDatabase } from "@/lib/database/database";
import { parseMediaConfig } from "./config";
import {
  listPublishedPackageSources,
  packageSourceFingerprint,
} from "./repository";
import { packageFilename } from "./packages";

export async function requestDownloadPackage(input: {
  trackId: string;
  scope: "stems" | "full";
  userId: string;
}) {
  const database = getDatabase();
  const config = parseMediaConfig();
  const subject = await listPublishedPackageSources(
    database,
    input.trackId,
    input.scope,
  );
  if (!subject) return null;
  const sourceBytes = subject.sources.reduce(
    (total, source) => total + source.byteSize,
    0,
  );
  if (subject.sources.length > config.packageMaxFiles)
    throw new Error(`Package exceeds the ${config.packageMaxFiles}-file limit`);
  if (sourceBytes > config.packageMaxSourceBytes)
    throw new Error("Package exceeds the 20 GiB source limit");
  const fingerprint = packageSourceFingerprint(
    subject.revisionId,
    input.scope,
    subject.sources,
  );
  await database.query(
    `UPDATE media.download_package
     SET status='expired'
     WHERE status='ready' AND expires_at <= now()`,
  );
  const existing = await database.query<
    { id: string; status: string; expires_at: Date | null } & QueryResultRow
  >(
    `SELECT id,status,expires_at
     FROM media.download_package
     WHERE track_id=$1 AND submission_revision_id=$2 AND scope=$3
       AND source_fingerprint=$4
       AND status IN ('queued','building','ready')
     ORDER BY created_at DESC LIMIT 1`,
    [input.trackId, subject.revisionId, input.scope, fingerprint],
  );
  if (existing.rows[0]) {
    return {
      packageId: existing.rows[0].id,
      status: existing.rows[0].status,
      expiresAt: existing.rows[0].expires_at?.toISOString() ?? null,
      reused: true,
    };
  }
  const packageId = randomUUID();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO media.download_package
         (id,track_id,submission_revision_id,scope,status,source_fingerprint,
          source_byte_size,file_count,original_filename,requested_by_user_id)
       VALUES ($1,$2,$3,$4,'queued',$5,$6,$7,$8,$9)`,
      [
        packageId,
        input.trackId,
        subject.revisionId,
        input.scope,
        fingerprint,
        sourceBytes,
        subject.sources.length,
        packageFilename(subject.title, input.scope),
        input.userId,
      ],
    );
    await client.query(
      `INSERT INTO media.delivery_job
         (id,job_type,download_package_id,status,max_attempts)
       VALUES ($1,'package',$2,'queued',$3)`,
      [randomUUID(), packageId, config.jobMaxRetries],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { packageId, status: "queued", expiresAt: null, reused: false };
}

export async function getDownloadPackageStatus(
  packageId: string,
  userId: string,
  allowAll: boolean,
) {
  const result = await getDatabase().query<
    {
      id: string;
      status: string;
      scope: "stems" | "full";
      expires_at: Date | null;
      byte_size: string | null;
      original_filename: string;
      requested_by_user_id: string;
    } & QueryResultRow
  >(
    `SELECT package.id,package.status,package.scope,package.expires_at,
            package.byte_size,package.original_filename,
            package.requested_by_user_id
     FROM media.download_package package
     JOIN catalog.track track
       ON track.id=package.track_id
      AND track.published_revision_id=package.submission_revision_id
     WHERE package.id=$1 AND track.publication_status='published'`,
    [packageId],
  );
  const row = result.rows[0];
  if (!row || (!allowAll && row.requested_by_user_id !== userId)) return null;
  const expired =
    row.status === "ready" &&
    row.expires_at !== null &&
    row.expires_at.getTime() <= Date.now();
  return {
    packageId: row.id,
    scope: row.scope,
    status: expired ? "expired" : row.status,
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    expiresAt: row.expires_at?.toISOString() ?? null,
    safeFilename: row.original_filename,
    downloadUrl:
      row.status === "ready" && !expired
        ? `/api/library/packages/${row.id}/download`
        : null,
  };
}
