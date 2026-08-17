import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import type { AccessStatus, UserRole } from "@/types/auth";

import {
  activateTeamAccessForIdentity,
  changeTeamRole,
  prepareLocalAssignment,
  requireActiveTeamAccess,
  setTeamAccessSuspended,
  upsertBootstrapAdmin,
} from "./team-access-repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

async function insertBoundAccess(
  pool: Pool,
  input: {
    role: UserRole;
    status?: AccessStatus;
    email?: string;
  },
) {
  const id = randomUUID();
  const userId = `user-${id}`;
  const email = input.email ?? `${id}@soundvault.test`;
  const status = input.status ?? "active";
  await pool.query(
    `INSERT INTO auth."user" (
       id, name, email, "emailVerified", "createdAt", "updatedAt", role
     ) VALUES ($1, $2, $3, true, now(), now(), $4)`,
    [userId, "Test Member", email, input.role],
  );
  await pool.query(
    `INSERT INTO auth.team_access (
       id, normalized_email, display_name, role, status, auth_user_id,
       provider, provider_account_id, activated_at
     ) VALUES ($1, lower($2), $3, $4, $5, $6, 'local', $7, now())`,
    [id, email, "Test Member", input.role, status, userId, email],
  );
  return { id, userId, email };
}

async function insertSession(pool: Pool, userId: string) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO auth.session (
       id, "expiresAt", token, "createdAt", "updatedAt", "userId"
     ) VALUES ($1, now() + interval '1 hour', $2, now(), now(), $3)`,
    [id, `token-${id}`, userId],
  );
}

databaseDescribe("PostgreSQL team-access transactions", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE auth.access_audit_event, auth.team_access,
                auth.session, auth.account, auth."user" CASCADE`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("binds a pending assignment once and makes retries idempotent", async () => {
    const email = "producer@soundvault.test";
    await prepareLocalAssignment(pool, {
      email,
      name: "Producer",
      role: "music_producer",
    });

    const activated = await activateTeamAccessForIdentity(pool, {
      userId: "producer-user",
      email,
      provider: "local",
      providerAccountId: email,
    });
    const retry = await activateTeamAccessForIdentity(pool, {
      userId: "producer-user",
      email,
      provider: "local",
      providerAccountId: email,
    });

    expect(activated.status).toBe("active");
    expect(retry.id).toBe(activated.id);
    await expect(
      activateTeamAccessForIdentity(pool, {
        userId: "different-user",
        email,
        provider: "local",
        providerAccountId: "different-account",
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_ASSIGNMENT" });
    const audit = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth.access_audit_event
       WHERE action = 'identity_activated'`,
    );
    expect(audit.rows[0]?.count).toBe("1");
  });

  it("does not let the wrong email consume a pending assignment", async () => {
    await prepareLocalAssignment(pool, {
      email: "approved@soundvault.test",
      name: "Approved User",
      role: "user",
    });

    await expect(
      activateTeamAccessForIdentity(pool, {
        userId: "wrong-user",
        email: "wrong@soundvault.test",
        provider: "local",
        providerAccountId: "wrong@soundvault.test",
      }),
    ).rejects.toMatchObject({ code: "TARGET_NOT_FOUND" });
    const assignment = await pool.query<{ status: string }>(
      `SELECT status FROM auth.team_access
       WHERE normalized_email = 'approved@soundvault.test'`,
    );
    expect(assignment.rows[0]?.status).toBe("pending");
  });

  it("denies suspended access", async () => {
    const member = await insertBoundAccess(pool, {
      role: "user",
      status: "suspended",
    });
    await expect(requireActiveTeamAccess(pool, member.userId)).rejects.toEqual(
      expect.objectContaining({ code: "ACCESS_SUSPENDED" }),
    );
  });

  it("changes the single stored role and revokes active sessions", async () => {
    const member = await insertBoundAccess(pool, { role: "user" });
    await insertSession(pool, member.userId);

    const updated = await changeTeamRole(pool, {
      accessId: member.id,
      role: "coordinator",
      actorUserId: "admin-actor",
      confirmed: false,
    });

    expect(updated.role).toBe("coordinator");
    const state = await pool.query<{ role: string; sessions: string }>(
      `SELECT u.role,
              (SELECT count(*)::text FROM auth.session s
               WHERE s."userId" = u.id) AS sessions
       FROM auth."user" u WHERE u.id = $1`,
      [member.userId],
    );
    expect(state.rows[0]).toEqual({ role: "coordinator", sessions: "0" });
  });

  it("suspends an assignment and revokes active sessions", async () => {
    const member = await insertBoundAccess(pool, { role: "user" });
    await insertSession(pool, member.userId);

    const updated = await setTeamAccessSuspended(pool, {
      accessId: member.id,
      suspended: true,
      actorUserId: "admin-actor",
    });

    expect(updated.status).toBe("suspended");
    const sessions = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth.session WHERE "userId" = $1`,
      [member.userId],
    );
    expect(sessions.rows[0]?.count).toBe("0");
  });

  it("prevents demoting or suspending the final active Admin", async () => {
    const admin = await insertBoundAccess(pool, { role: "admin" });

    await expect(
      changeTeamRole(pool, {
        accessId: admin.id,
        role: "user",
        actorUserId: admin.userId,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "FINAL_ADMIN" });
    await expect(
      setTeamAccessSuspended(pool, {
        accessId: admin.id,
        suspended: true,
        actorUserId: admin.userId,
      }),
    ).rejects.toMatchObject({ code: "FINAL_ADMIN" });
  });

  it("serializes concurrent Admin demotions so one active Admin remains", async () => {
    const first = await insertBoundAccess(pool, { role: "admin" });
    const second = await insertBoundAccess(pool, { role: "admin" });

    const results = await Promise.allSettled([
      changeTeamRole(pool, {
        accessId: first.id,
        role: "user",
        actorUserId: first.userId,
        confirmed: true,
      }),
      changeTeamRole(pool, {
        accessId: second.id,
        role: "user",
        actorUserId: second.userId,
        confirmed: true,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const admins = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth.team_access
       WHERE role = 'admin' AND status = 'active'`,
    );
    expect(admins.rows[0]?.count).toBe("1");
  });

  it("rejects invalid role values at the database boundary", async () => {
    await expect(
      pool.query(
        `INSERT INTO auth.team_access (normalized_email, role, status)
         VALUES ('invalid@soundvault.test', 'reviewer', 'pending')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("bootstraps one normalized pending Admin idempotently", async () => {
    const first = await upsertBootstrapAdmin(
      pool,
      "  FIRST.ADMIN@SoundVault.Test ",
    );
    const second = await upsertBootstrapAdmin(
      pool,
      "first.admin@soundvault.test",
    );

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      normalizedEmail: "first.admin@soundvault.test",
      role: "admin",
      status: "pending",
    });
    const assignments = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth.team_access`,
    );
    expect(assignments.rows[0]?.count).toBe("1");
  });
});
