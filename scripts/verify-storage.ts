import { mkdir, stat } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";
import { ClientSecretCredential } from "@azure/identity";

import { parseStorageConfig } from "../src/lib/storage/config";

loadEnvConfig(process.cwd());

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE = "https://graph.microsoft.com/.default";

async function graph<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GRAPH}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.text();
    let detail = body.slice(0, 300);
    try {
      detail =
        (JSON.parse(body) as { error?: { message?: string } }).error?.message ??
        detail;
    } catch {
      // Graph does not always return JSON on failure.
    }
    throw new Error(`Graph ${response.status}: ${detail}`);
  }
  return (await response.json()) as T;
}

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

  const token = (
    await new ClientSecretCredential(
      oneDrive.tenantId,
      oneDrive.clientId,
      oneDrive.clientSecret,
    ).getToken(SCOPE)
  )?.token;
  if (!token) throw new Error("Microsoft Graph token acquisition failed");
  console.log("Application token acquired.");

  const drive = await graph<{ id: string; name: string; driveType: string }>(
    `/drives/${encodeURIComponent(oneDrive.driveId)}`,
    token,
  );
  console.log(`Drive reachable: "${drive.name}" (${drive.driveType}).`);

  const root = await graph<{
    id: string;
    name: string;
    folder?: { childCount: number };
  }>(
    `/drives/${encodeURIComponent(oneDrive.driveId)}/items/${encodeURIComponent(
      oneDrive.rootItemId,
    )}`,
    token,
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
