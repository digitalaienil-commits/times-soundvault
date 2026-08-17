import { createPostgresPool } from "@/lib/database/pool";
import { listTeamAccess } from "@/lib/auth/team-access-repository";

import { getScriptEnvironment } from "./environment";

async function main() {
  const environment = getScriptEnvironment();
  const pool = createPostgresPool(environment.databaseUrl);
  try {
    const members = await listTeamAccess(pool);
    console.table(
      members.map((member) => ({
        accessId: member.id,
        userId: member.authUserId ?? "pending",
        name: member.displayName ?? "",
        email: member.normalizedEmail,
        role: member.role,
        status: member.status,
        provider: member.provider ?? "unbound",
        created: member.createdAt.toISOString(),
      })),
    );
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error(
    "Team listing failed. Review the database connection and migration state.",
  );
  process.exitCode = 1;
});
