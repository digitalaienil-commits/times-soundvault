import { createPostgresPool } from "@/lib/database/pool";
import { upsertBootstrapAdmin } from "@/lib/auth/team-access-repository";

import { getScriptEnvironment } from "./environment";

function readEmailArgument(): string {
  const indexes = process.argv.flatMap((value, index) =>
    value === "--email" ? [index] : [],
  );
  if (indexes.length !== 1) {
    throw new Error("Use exactly one --email <corporate-email> argument");
  }
  const email = process.argv[indexes[0] + 1];
  if (!email || email.startsWith("--")) {
    throw new Error("--email requires one corporate email value");
  }
  return email;
}

async function main() {
  const environment = getScriptEnvironment();
  if (
    environment.provider === "local" &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("Local authentication is forbidden in production");
  }
  const pool = createPostgresPool(environment.databaseUrl);
  try {
    const access = await upsertBootstrapAdmin(pool, readEmailArgument());
    console.info(
      `Admin access assignment is ${access.status}. Access record: ${access.id}.`,
    );
    console.info(
      "The person must sign in with the configured corporate provider.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Admin bootstrap failed",
  );
  process.exitCode = 1;
});
