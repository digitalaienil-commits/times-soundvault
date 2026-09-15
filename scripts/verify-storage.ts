import { mkdir, stat } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

import { parseStorageConfig } from "../src/lib/storage/config";
import {
  acquireGraphApplication,
  describeGrantedPermissions,
  graph,
} from "./graph-app-client";

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
  const oneDrive = config.oneDrive;
  console.log("OneDrive configuration is present and correctly shaped.");

  // Shape alone proved nothing: a wrong secret, a missing admin consent or a
  // drive the app cannot reach all look identical until the first upload.
  if (process.argv.includes("--offline")) {
    console.log("Offline check only. No Microsoft Graph request was made.");
    return;
  }

  const app = await acquireGraphApplication(oneDrive);
  console.log(`Application token acquired for "${app.displayName}".`);
  console.log(describeGrantedPermissions(app));

  const drive = await graph<{ id: string; name: string; driveType: string }>(
    app,
    `/drives/${encodeURIComponent(oneDrive.driveId)}`,
  );
  console.log(`Drive reachable: "${drive.name}" (${drive.driveType}).`);

  const root = await graph<{
    id: string;
    name: string;
    folder?: { childCount: number };
  }>(
    app,
    `/drives/${encodeURIComponent(oneDrive.driveId)}/items/${encodeURIComponent(
      oneDrive.rootItemId,
    )}`,
  );
  if (!root.folder) {
    throw new Error(
      `ONEDRIVE_ROOT_ITEM_ID points at "${root.name}", which is not a folder.`,
    );
  }
  console.log(
    `Root folder reachable: "${root.name}" (${root.folder.childCount} items).`,
  );
  console.log(
    "Read access verified. Write access is proven only by a real upload; no file was created and no secret was printed.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Storage verification failed",
  );
  process.exitCode = 1;
});
