import type { Pool } from "pg";

import { createSoundVaultAuth } from "@/lib/auth/auth-factory";
import {
  activateTeamAccessForIdentity,
  prepareLocalAssignment,
} from "@/lib/auth/team-access-repository";
import { createPostgresPool } from "@/lib/database/pool";
import type { LocalIdentityConfig } from "@/lib/auth/environment-schema";
import type { UserRole } from "@/types/auth";

import { getScriptEnvironment } from "./environment";

async function seedIdentity(
  pool: Pool,
  auth: ReturnType<typeof createSoundVaultAuth>,
  identity: LocalIdentityConfig,
  role: UserRole,
) {
  const assignment = await prepareLocalAssignment(pool, {
    email: identity.email,
    name: identity.name,
    role,
  });
  console.info(`Prepared ${role} assignment with ${assignment.status} status.`);
  const existingUser = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM auth."user" WHERE lower(email) = $1 LIMIT 1`,
    [identity.email],
  );
  if (existingUser.rows[0]) {
    const user = existingUser.rows[0];
    await pool.query(
      `UPDATE auth."user" SET role = $2, name = $3, "updatedAt" = now() WHERE id = $1`,
      [user.id, role, identity.name],
    );
    if (assignment.status !== "active") {
      const account = await pool.query<{ accountId: string }>(
        `SELECT "accountId" FROM auth.account
         WHERE "userId" = $1 AND "providerId" = 'credential'
         LIMIT 1`,
        [user.id],
      );
      if (!account.rows[0]) {
        throw new Error(
          `The local account for ${identity.email} is incomplete`,
        );
      }
      await activateTeamAccessForIdentity(pool, {
        userId: user.id,
        email: user.email,
        provider: "local",
        providerAccountId: account.rows[0].accountId,
      });
    }
    return;
  }

  const result = await auth.api.signUpEmail({
    body: {
      name: identity.name,
      email: identity.email,
      password: identity.password,
    },
  });
  if (!result.user) {
    throw new Error(`Local user creation failed for ${identity.email}`);
  }
  await pool.query(`DELETE FROM auth.session WHERE "userId" = $1`, [
    result.user.id,
  ]);
}

async function main() {
  const environment = getScriptEnvironment();
  if (environment.provider !== "local" || !environment.local) {
    throw new Error("auth:seed-local requires AUTH_PROVIDER=local");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local user seeding is forbidden in production");
  }
  const pool = createPostgresPool(environment.databaseUrl);
  const auth = createSoundVaultAuth(environment, pool, {
    allowLocalSignUp: true,
  });
  try {
    await seedIdentity(pool, auth, environment.local.admin, "admin");
    await seedIdentity(
      pool,
      auth,
      environment.local.musicProducer,
      "music_producer",
    );
    await seedIdentity(
      pool,
      auth,
      environment.local.coordinator,
      "coordinator",
    );
    await seedIdentity(pool, auth, environment.local.user, "user");
    console.info(
      "Seeded four local SoundVault identities. Passwords were not printed.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Local auth seeding failed",
  );
  process.exitCode = 1;
});
