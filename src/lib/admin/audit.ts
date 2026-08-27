import "server-only";

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;

export type AdminAuditSubject =
  | "system"
  | "team"
  | "taxonomy"
  | "catalog"
  | "submission"
  | "processing"
  | "media"
  | "copyright"
  | "demand"
  | "retention"
  | "integrity";

export async function recordAdminAuditEvent(
  database: Queryable,
  input: {
    actorUserId?: string | null;
    subjectType: AdminAuditSubject;
    subjectId?: string | null;
    action: string;
    severity?: "info" | "warning" | "high";
    metadata?: Record<string, unknown>;
  },
) {
  await database.query(
    `INSERT INTO system.admin_audit_event (
       id, actor_user_id, subject_type, subject_id, action, severity, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      randomUUID(),
      input.actorUserId ?? null,
      input.subjectType,
      input.subjectId ?? null,
      input.action,
      input.severity ?? "info",
      input.metadata ?? {},
    ],
  );
}
