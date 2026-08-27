import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";

import { getDatabase } from "@/lib/database/database";

import { recordAdminAuditEvent } from "./audit";

type Queryable = Pick<Pool | PoolClient, "query">;

export type MaintenanceJobType =
  | "system_health_check"
  | "search_rebuild"
  | "media_reconcile"
  | "processing_reclaim"
  | "retention_dry_run"
  | "retention_cleanup"
  | "catalog_integrity_scan";

export interface AdminMaintenanceJob {
  id: string;
  jobType: MaintenanceJobType;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  subjectType: string;
  subjectId: string | null;
  requestSummary: string;
  dryRun: boolean;
  maxScope: number;
  resultSummary: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface JobRow extends QueryResultRow {
  id: string;
  job_type: MaintenanceJobType;
  status: AdminMaintenanceJob["status"];
  subject_type: string;
  subject_id: string | null;
  request_summary: string;
  dry_run: boolean;
  max_scope: number;
  result_summary: string | null;
  last_error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

const jobTypeSchema = z.enum([
  "system_health_check",
  "search_rebuild",
  "media_reconcile",
  "processing_reclaim",
  "retention_dry_run",
  "retention_cleanup",
  "catalog_integrity_scan",
]);

function mapJob(row: JobRow): AdminMaintenanceJob {
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    requestSummary: row.request_summary,
    dryRun: row.dry_run,
    maxScope: Number(row.max_scope),
    resultSummary: row.result_summary,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminMaintenanceJobs(
  database: Queryable = getDatabase(),
): Promise<AdminMaintenanceJob[]> {
  const result = await database.query<JobRow>(
    `SELECT * FROM system.maintenance_job
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
  );
  return result.rows.map(mapJob);
}

export async function enqueueAdminMaintenanceJob(input: {
  jobType: MaintenanceJobType;
  subjectType:
    "system" | "catalog" | "processing" | "media" | "retention" | "integrity";
  subjectId?: string | null;
  requestSummary: string;
  dryRun?: boolean;
  maxScope?: number;
  actorUserId: string;
}) {
  const jobType = jobTypeSchema.parse(input.jobType);
  const maxScope = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(25)
    .parse(input.maxScope ?? 25);
  return withTransaction(getDatabase(), async (client) => {
    const id = randomUUID();
    const result = await client.query<JobRow>(
      `INSERT INTO system.maintenance_job (
         id, job_type, subject_type, subject_id, requested_by_user_id,
         request_summary, dry_run, max_scope
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        id,
        jobType,
        input.subjectType,
        input.subjectId ?? null,
        input.actorUserId,
        input.requestSummary.trim().slice(0, 500),
        input.dryRun ?? true,
        maxScope,
      ],
    );
    await recordAdminAuditEvent(client, {
      actorUserId: input.actorUserId,
      subjectType:
        input.subjectType === "processing"
          ? "processing"
          : input.subjectType === "media"
            ? "media"
            : input.subjectType === "retention"
              ? "retention"
              : input.subjectType === "integrity"
                ? "integrity"
                : input.subjectType === "catalog"
                  ? "catalog"
                  : "system",
      subjectId: id,
      action: "maintenance_job_enqueued",
      metadata: { jobType, dryRun: input.dryRun ?? true, maxScope },
    });
    return mapJob(result.rows[0]!);
  });
}

export async function reclaimExpiredProcessingJobs(actorUserId: string) {
  return withTransaction(getDatabase(), async (client) => {
    const processing = await client.query(
      `UPDATE analysis.processing_job
       SET status = 'retry_wait',
           lease_owner = NULL,
           lease_expires_at = NULL,
           next_attempt_at = now(),
           last_error_code = 'admin_reclaimed',
           last_error_message = 'Expired running job lease reclaimed by Admin.'
       WHERE status = 'running' AND lease_expires_at <= now()`,
    );
    const media = await client.query(
      `UPDATE media.delivery_job
       SET status = 'queued',
           lease_owner = NULL,
           lease_expires_at = NULL,
           available_at = now(),
           last_error_code = 'admin_reclaimed',
           last_error_message = 'Expired running job lease reclaimed by Admin.'
       WHERE status = 'running' AND lease_expires_at <= now()`,
    );
    await recordAdminAuditEvent(client, {
      actorUserId,
      subjectType: "processing",
      action: "expired_jobs_reclaimed",
      metadata: {
        processingJobs: processing.rowCount ?? 0,
        mediaJobs: media.rowCount ?? 0,
      },
    });
    return {
      processingJobs: processing.rowCount ?? 0,
      mediaJobs: media.rowCount ?? 0,
    };
  });
}
