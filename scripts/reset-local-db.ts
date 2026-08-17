import { spawnSync } from "node:child_process";

function runDocker(args: string[]) {
  const result = spawnSync("docker", ["compose", ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("Docker Compose command failed");
  }
}

function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Database reset is forbidden in production");
  }
  if (!process.argv.includes("--confirm-local-reset")) {
    throw new Error(
      "Local reset requires: pnpm db:reset -- --confirm-local-reset",
    );
  }
  console.info("Removing only the Times SoundVault local PostgreSQL volume.");
  runDocker(["down", "--volumes", "--remove-orphans"]);
  runDocker(["up", "-d", "--wait"]);
  console.info("Local PostgreSQL was reset. Run pnpm auth:migrate next.");
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Local database reset failed",
  );
  process.exitCode = 1;
}
