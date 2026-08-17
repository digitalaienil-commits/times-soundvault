import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

function secret(bytes: number) {
  return randomBytes(bytes).toString("base64url");
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local environment creation is forbidden in production");
  }
  const contents = [
    "AUTH_PROVIDER=local",
    `BETTER_AUTH_SECRET=${secret(48)}`,
    "BETTER_AUTH_URL=http://localhost:3000",
    "AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000",
    "DATABASE_URL=postgresql://soundvault:soundvault_local@localhost:5432/soundvault",
    "LOCAL_ADMIN_NAME=Local Admin",
    "LOCAL_ADMIN_EMAIL=admin@soundvault.local",
    `LOCAL_ADMIN_PASSWORD=${secret(24)}`,
    "LOCAL_PRODUCER_NAME=Local Music Producer",
    "LOCAL_PRODUCER_EMAIL=producer@soundvault.local",
    `LOCAL_PRODUCER_PASSWORD=${secret(24)}`,
    "LOCAL_COORDINATOR_NAME=Local Coordinator",
    "LOCAL_COORDINATOR_EMAIL=coordinator@soundvault.local",
    `LOCAL_COORDINATOR_PASSWORD=${secret(24)}`,
    "LOCAL_USER_NAME=Local User",
    "LOCAL_USER_EMAIL=user@soundvault.local",
    `LOCAL_USER_PASSWORD=${secret(24)}`,
    "",
  ].join("\n");
  await writeFile(path.join(process.cwd(), ".env.local"), contents, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  console.info(
    "Created .env.local with generated local-only credentials. Values were not printed.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Local environment creation failed",
  );
  process.exitCode = 1;
});
