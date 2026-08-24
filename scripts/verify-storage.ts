import { mkdir, stat } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

import { parseStorageConfig } from "../src/lib/storage/config";

loadEnvConfig(process.cwd());

async function main() {
  const config = parseStorageConfig();
  if (config.provider === "local") {
    await mkdir(config.localRoot, { recursive: true, mode: 0o700 });
    const root = await stat(config.localRoot);
    if (!root.isDirectory())
      throw new Error("LOCAL_STORAGE_ROOT is not a directory");
    console.log(`Local private storage is ready at ${config.localRoot}`);
    return;
  }
  if (!config.oneDrive) throw new Error("OneDrive configuration is incomplete");
  console.log(
    "OneDrive configuration is valid. No file was uploaded and no secret was printed.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Storage verification failed",
  );
  process.exitCode = 1;
});
