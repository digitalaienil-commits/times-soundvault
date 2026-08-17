import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";

import type { AccessStatus, AuthProvider, UserRole } from "@/types/auth";
import { isAccessStatus, isUserRole } from "@/types/auth";
import type {
  AccessAuditAction,
  AccessAuditEvent,
  TeamAccessRecord,
} from "@/types/team-access";

type Queryable = Pick<Pool | PoolClient, "query">;

interface TeamAccessRow extends QueryResultRow {
  id: string;
  normalized_email: string;
  display_name: string | null;
  role: string;
  status: string;
  auth_user_id: string | null;
  provider: string | null;
  provider_account_id: string | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  activated_at: Date | null;
  suspended_at: Date | null;
  last_role_changed_at: Date | null;
}

interface AuditRow extends QueryResultRow {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  target_access_id: string;
  action: AccessAuditAction;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  request_id: string | null;
  created_at: Date;
}

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());

export class TeamAccessError extends Error {
  constructor(
    public readonly code:
      | "ACCESS_NOT_ASSIGNED"
      | "ACCESS_SUSPENDED"
      | "DUPLICATE_ASSIGNMENT"
      | "FINAL_ADMIN"
      | "INVALID_ACCESS_RECORD"
      | "TARGET_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "TeamAccessError";
  }
}

export function normalizeCorporateEmail(value: string): string {
  return emailSchema.parse(value);
}

function mapProvider(value: string | null): AuthProvider | null {
  if (value === "google" || value === "microsoft" || value === "local") {
    return value;
  }
  return null;
}

function mapTeamAccess(row: TeamAccessRow): TeamAccessRecord | null {
  if (!isUserRole(row.role) || !isAccessStatus(row.status)) {
    return null;
  }
  const provider = mapProvider(row.provider);
  if (row.provider !== null && provider === null) {
    return null;
  }

  return {
    id: row.id,
    normalizedEmail: row.normalized_email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    authUserId: row.auth_user_id,
    provider,
    providerAccountId: row.provider_account_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activatedAt: row.activated_at,
    suspendedAt: row.suspended_at,
    lastRoleChangedAt: row.last_role_changed_at,
  };
}

function mapRequiredAccess(row: TeamAccessRow | undefined): TeamAccessRecord {
  if (!row) {
    throw new TeamAccessError("TARGET_NOT_FOUND", "Team member was not found");
  }
  const access = mapTeamAccess(row);
  if (!access) {
    throw new TeamAccessError(
      "INVALID_ACCESS_RECORD",
      "The team-access record is invalid",
    );
  }
  return access;
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

async function insertAuditEvent(
  client: Queryable,
  input: {
    actorUserId?: string | null;
    targetUserId?: string | null;
    targetAccessId: string;
    action: AccessAuditAction;
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    requestId?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO auth.access_audit_event (
      actor_user_id, target_user_id, target_access_id, action,
      previous_value, new_value, request_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.actorUserId ?? null,
      input.targetUserId ?? null,
      input.targetAccessId,
      input.action,
      input.previousValue ?? null,
      input.newValue ?? null,
      input.requestId ?? randomUUID(),
    ],
  );
}

export async function findTeamAccessByUserId(
  database: Queryable,
  userId: string,
): Promise<TeamAccessRecord | null> {
  const result = await database.query<TeamAccessRow>(
    `SELECT * FROM auth.team_access WHERE auth_user_id = $1 LIMIT 1`,
    [userId],
  );
  return result.rows[0] ? mapTeamAccess(result.rows[0]) : null;
}

export async function findPendingTeamAccessByEmail(
  database: Queryable,
  email: string,
): Promise<TeamAccessRecord | null> {
  const result = await database.query<TeamAccessRow>(
    `SELECT * FROM auth.team_access
     WHERE normalized_email = $1 AND status = 'pending'
     LIMIT 1`,
    [normalizeCorporateEmail(email)],
  );
  return result.rows[0] ? mapTeamAccess(result.rows[0]) : null;
}

export async function requireActiveTeamAccess(
  database: Queryable,
  userId: string,
): Promise<TeamAccessRecord> {
  const access = await findTeamAccessByUserId(database, userId);
  if (!access) {
    throw new TeamAccessError(
      "ACCESS_NOT_ASSIGNED",
      "SoundVault access has not been assigned",
    );
  }
  if (access.status !== "active") {
    throw new TeamAccessError(
      access.status === "suspended"
        ? "ACCESS_SUSPENDED"
        : "ACCESS_NOT_ASSIGNED",
      "SoundVault access is not active",
    );
  }
  return access;
}

export async function activateTeamAccessForIdentity(
  pool: Pool,
  input: {
    userId: string;
    email: string;
    provider: AuthProvider;
    providerAccountId: string;
  },
): Promise<TeamAccessRecord> {
  return withTransaction(pool, async (client) => {
    const email = normalizeCorporateEmail(input.email);
    const result = await client.query<TeamAccessRow>(
      `SELECT * FROM auth.team_access
       WHERE normalized_email = $1
       FOR UPDATE`,
      [email],
    );
    const access = mapRequiredAccess(result.rows[0]);
    if (access.status === "suspended") {
      throw new TeamAccessError(
        "ACCESS_SUSPENDED",
        "SoundVault access is suspended",
      );
    }
    if (access.authUserId && access.authUserId !== input.userId) {
      throw new TeamAccessError(
        "DUPLICATE_ASSIGNMENT",
        "This access assignment is already bound",
      );
    }
    if (
      access.status === "active" &&
      access.authUserId === input.userId &&
      access.provider === input.provider &&
      access.providerAccountId === input.providerAccountId
    ) {
      return access;
    }

    const updated = await client.query<TeamAccessRow>(
      `UPDATE auth.team_access
       SET auth_user_id = $2,
           provider = $3,
           provider_account_id = $4,
           status = 'active',
           activated_at = COALESCE(activated_at, now()),
           suspended_at = NULL,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [access.id, input.userId, input.provider, input.providerAccountId],
    );
    const activated = mapRequiredAccess(updated.rows[0]);
    await insertAuditEvent(client, {
      targetUserId: input.userId,
      targetAccessId: access.id,
      action: "identity_activated",
      previousValue: { status: access.status },
      newValue: { status: "active", provider: input.provider },
    });
    return activated;
  });
}

export async function listTeamAccess(
  database: Queryable,
  filters: { search?: string; role?: string; status?: string } = {},
): Promise<TeamAccessRecord[]> {
  const values: string[] = [];
  const conditions: string[] = [];
  if (filters.search?.trim()) {
    values.push(`%${filters.search.trim()}%`);
    conditions.push(
      `(normalized_email ILIKE $${values.length} OR COALESCE(display_name, '') ILIKE $${values.length})`,
    );
  }
  if (isUserRole(filters.role)) {
    values.push(filters.role);
    conditions.push(`role = $${values.length}`);
  }
  if (isAccessStatus(filters.status)) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await database.query<TeamAccessRow>(
    `SELECT * FROM auth.team_access ${where}
     ORDER BY
       CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
       COALESCE(display_name, normalized_email)`,
    values,
  );
  return result.rows.flatMap((row) => {
    const access = mapTeamAccess(row);
    return access ? [access] : [];
  });
}

export async function listAccessHistory(
  database: Queryable,
  accessId: string,
  limit = 8,
): Promise<AccessAuditEvent[]> {
  const result = await database.query<AuditRow>(
    `SELECT * FROM auth.access_audit_event
     WHERE target_access_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [accessId, Math.min(Math.max(limit, 1), 20)],
  );
  return result.rows.map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    targetUserId: row.target_user_id,
    targetAccessId: row.target_access_id,
    action: row.action,
    previousValue: row.previous_value,
    newValue: row.new_value,
    requestId: row.request_id,
    createdAt: row.created_at,
  }));
}

export async function addTeamAccess(
  pool: Pool,
  input: {
    email: string;
    displayName?: string | null;
    role: UserRole;
    actorUserId: string;
  },
): Promise<TeamAccessRecord> {
  if (!isUserRole(input.role)) {
    throw new TeamAccessError("INVALID_ACCESS_RECORD", "Choose a valid role");
  }
  try {
    return await withTransaction(pool, async (client) => {
      const result = await client.query<TeamAccessRow>(
        `INSERT INTO auth.team_access (
          normalized_email, display_name, role, status, created_by_user_id
        ) VALUES ($1, $2, $3, 'pending', $4)
        RETURNING *`,
        [
          normalizeCorporateEmail(input.email),
          input.displayName?.trim() || null,
          input.role,
          input.actorUserId,
        ],
      );
      const access = mapRequiredAccess(result.rows[0]);
      await insertAuditEvent(client, {
        actorUserId: input.actorUserId,
        targetAccessId: access.id,
        action: "team_member_added",
        newValue: { role: access.role, status: access.status },
      });
      return access;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new TeamAccessError(
        "DUPLICATE_ASSIGNMENT",
        "A team assignment already exists for this email",
      );
    }
    throw error;
  }
}

async function lockAccessRecord(
  client: PoolClient,
  accessId: string,
): Promise<TeamAccessRecord> {
  await client.query("LOCK TABLE auth.team_access IN SHARE ROW EXCLUSIVE MODE");
  const result = await client.query<TeamAccessRow>(
    `SELECT * FROM auth.team_access WHERE id = $1 FOR UPDATE`,
    [accessId],
  );
  return mapRequiredAccess(result.rows[0]);
}

async function assertNotFinalActiveAdmin(
  client: PoolClient,
  access: TeamAccessRecord,
): Promise<void> {
  if (access.role !== "admin" || access.status !== "active") {
    return;
  }
  const count = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM auth.team_access
     WHERE role = 'admin' AND status = 'active'`,
  );
  if (Number(count.rows[0]?.count ?? 0) <= 1) {
    throw new TeamAccessError(
      "FINAL_ADMIN",
      "The final active Admin cannot be changed or suspended",
    );
  }
}

async function revokeUserSessions(
  client: PoolClient,
  access: TeamAccessRecord,
  actorUserId: string,
): Promise<number> {
  if (!access.authUserId) {
    return 0;
  }
  const result = await client.query(
    `DELETE FROM auth.session WHERE "userId" = $1`,
    [access.authUserId],
  );
  await insertAuditEvent(client, {
    actorUserId,
    targetUserId: access.authUserId,
    targetAccessId: access.id,
    action: "sessions_revoked",
    newValue: { revokedSessionCount: result.rowCount ?? 0 },
  });
  return result.rowCount ?? 0;
}

export async function changeTeamRole(
  pool: Pool,
  input: {
    accessId: string;
    role: UserRole;
    actorUserId: string;
    confirmed: boolean;
  },
): Promise<TeamAccessRecord> {
  if (!isUserRole(input.role)) {
    throw new TeamAccessError("INVALID_ACCESS_RECORD", "Choose a valid role");
  }
  return withTransaction(pool, async (client) => {
    const access = await lockAccessRecord(client, input.accessId);
    if (access.role === input.role) {
      return access;
    }
    if (
      (access.role === "admin" || input.role === "admin") &&
      !input.confirmed
    ) {
      throw new TeamAccessError(
        "INVALID_ACCESS_RECORD",
        "Admin role changes require explicit confirmation",
      );
    }
    if (access.role === "admin" && input.role !== "admin") {
      await assertNotFinalActiveAdmin(client, access);
    }

    const result = await client.query<TeamAccessRow>(
      `UPDATE auth.team_access
       SET role = $2, last_role_changed_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [access.id, input.role],
    );
    if (access.authUserId) {
      await client.query(
        `UPDATE auth."user" SET role = $2, "updatedAt" = now() WHERE id = $1`,
        [access.authUserId, input.role],
      );
    }
    await insertAuditEvent(client, {
      actorUserId: input.actorUserId,
      targetUserId: access.authUserId,
      targetAccessId: access.id,
      action: "role_changed",
      previousValue: { role: access.role },
      newValue: { role: input.role },
    });
    await revokeUserSessions(client, access, input.actorUserId);
    return mapRequiredAccess(result.rows[0]);
  });
}

export async function setTeamAccessSuspended(
  pool: Pool,
  input: {
    accessId: string;
    suspended: boolean;
    actorUserId: string;
  },
): Promise<TeamAccessRecord> {
  return withTransaction(pool, async (client) => {
    const access = await lockAccessRecord(client, input.accessId);
    if (input.suspended) {
      await assertNotFinalActiveAdmin(client, access);
    }
    const nextStatus: AccessStatus = input.suspended
      ? "suspended"
      : access.authUserId
        ? "active"
        : "pending";
    const result = await client.query<TeamAccessRow>(
      `UPDATE auth.team_access
       SET status = $2,
           suspended_at = CASE WHEN $2 = 'suspended' THEN now() ELSE NULL END,
           activated_at = CASE WHEN $2 = 'active' THEN COALESCE(activated_at, now()) ELSE activated_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [access.id, nextStatus],
    );
    await insertAuditEvent(client, {
      actorUserId: input.actorUserId,
      targetUserId: access.authUserId,
      targetAccessId: access.id,
      action: input.suspended ? "access_suspended" : "access_reactivated",
      previousValue: { status: access.status },
      newValue: { status: nextStatus },
    });
    await revokeUserSessions(client, access, input.actorUserId);
    return mapRequiredAccess(result.rows[0]);
  });
}

export async function upsertBootstrapAdmin(
  pool: Pool,
  emailInput: string,
): Promise<TeamAccessRecord> {
  return withTransaction(pool, async (client) => {
    const email = normalizeCorporateEmail(emailInput);
    const existing = await client.query<TeamAccessRow>(
      `SELECT * FROM auth.team_access WHERE normalized_email = $1 FOR UPDATE`,
      [email],
    );
    if (existing.rows[0]) {
      const access = mapRequiredAccess(existing.rows[0]);
      if (access.status === "active" && access.role !== "admin") {
        throw new TeamAccessError(
          "INVALID_ACCESS_RECORD",
          "An active non-Admin assignment cannot be promoted by bootstrap",
        );
      }
      const updated = await client.query<TeamAccessRow>(
        `UPDATE auth.team_access
         SET role = 'admin', updated_at = now(),
             last_role_changed_at = CASE WHEN role <> 'admin' THEN now() ELSE last_role_changed_at END
         WHERE id = $1 RETURNING *`,
        [access.id],
      );
      const result = mapRequiredAccess(updated.rows[0]);
      await insertAuditEvent(client, {
        targetUserId: result.authUserId,
        targetAccessId: result.id,
        action: "bootstrap_admin_assigned",
        previousValue: { role: access.role, status: access.status },
        newValue: { role: "admin", status: result.status },
      });
      return result;
    }
    const inserted = await client.query<TeamAccessRow>(
      `INSERT INTO auth.team_access (normalized_email, role, status)
       VALUES ($1, 'admin', 'pending') RETURNING *`,
      [email],
    );
    const result = mapRequiredAccess(inserted.rows[0]);
    await insertAuditEvent(client, {
      targetAccessId: result.id,
      action: "bootstrap_admin_assigned",
      newValue: { role: "admin", status: "pending" },
    });
    return result;
  });
}

export async function prepareLocalAssignment(
  pool: Pool,
  input: { email: string; name: string; role: UserRole },
): Promise<TeamAccessRecord> {
  return withTransaction(pool, async (client) => {
    const email = normalizeCorporateEmail(input.email);
    const result = await client.query<TeamAccessRow>(
      `INSERT INTO auth.team_access (normalized_email, display_name, role, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (normalized_email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         role = EXCLUDED.role,
         status = CASE
           WHEN auth.team_access.status = 'suspended' THEN 'pending'
           ELSE auth.team_access.status
         END,
         suspended_at = NULL,
         updated_at = now()
       RETURNING *`,
      [email, input.name.trim(), input.role],
    );
    return mapRequiredAccess(result.rows[0]);
  });
}
