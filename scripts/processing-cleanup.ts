import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { parseProcessingConfig } =
    await import("../src/lib/processing/config");
  const { listStaleProcessingDirectories, removeStaleProcessingDirectory } =
    await import("../src/lib/processing/temp-storage");
  const config = parseProcessingConfig();
  const stale = await listStaleProcessingDirectories(
    config.tempRoot,
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );
  for (const item of stale.slice(0, 100))
    await removeStaleProcessingDirectory(config.tempRoot, item.path);
  console.info(
    `Removed ${Math.min(stale.length, 100)} stale processing director${stale.length === 1 ? "y" : "ies"}.`,
  );
}
void main();
