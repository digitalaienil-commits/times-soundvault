import "server-only";

import { createReadStream } from "node:fs";
import {
  access,
  link,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const ARTIFACT_KEY = /^batches\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.mp4$/;
const MANIFEST_KEY = /^batches\/([0-9a-f-]{36})\/manifest\.json$/;

export function resolveCopyrightRoot(configuredRoot: string): string {
  return path.resolve(process.cwd(), configuredRoot);
}

function resolvePrivateKey(root: string, key: string, pattern: RegExp): string {
  if (!pattern.test(key)) throw new Error("Copyright artifact key is invalid");
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, key);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error("Copyright artifact key escapes its private root");
  return resolved;
}

export function resolveArtifactPath(root: string, key: string): string {
  return resolvePrivateKey(root, key, ARTIFACT_KEY);
}

export function resolveManifestPath(root: string, key: string): string {
  return resolvePrivateKey(root, key, MANIFEST_KEY);
}

export async function prepareBatchDirectories(root: string, batchId: string) {
  if (!/^[0-9a-f-]{36}$/.test(batchId)) throw new Error("Batch ID is invalid");
  const privateRoot = path.resolve(root);
  const batchDirectory = path.join(privateRoot, "batches", batchId);
  const runDirectory = path.join(privateRoot, "runs", batchId);
  await mkdir(batchDirectory, { recursive: true, mode: 0o700 });
  await rm(runDirectory, { recursive: true, force: true });
  await mkdir(runDirectory, { recursive: true, mode: 0o700 });
  return {
    batchDirectory,
    runDirectory,
    artifactKey: `batches/${batchId}/${batchId}.mp4`,
    manifestKey: `batches/${batchId}/manifest.json`,
    artifactPath: path.join(batchDirectory, `${batchId}.mp4`),
    manifestPath: path.join(batchDirectory, "manifest.json"),
    temporaryArtifactPath: path.join(runDirectory, `${batchId}.mp4.part`),
    sourcePath: (index: number, extension: ".wav" | ".mp3") =>
      path.join(
        runDirectory,
        `${String(index + 1).padStart(3, "0")}${extension}`,
      ),
    cleanup: () => rm(runDirectory, { recursive: true, force: true }),
  };
}

export async function publishArtifact(
  temporaryPath: string,
  finalPath: string,
): Promise<void> {
  try {
    await link(temporaryPath, finalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
  await access(finalPath);
}

export async function writeManifestExclusive(
  manifestPath: string,
  manifest: unknown,
): Promise<void> {
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  try {
    await writeFile(manifestPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(manifestPath, "utf8");
    if (existing !== content)
      throw new Error(
        "Existing batch manifest does not match the deterministic result",
      );
  }
}

export async function openArtifactForStreaming(root: string, key: string) {
  const artifactPath = resolveArtifactPath(root, key);
  const handle = await open(artifactPath, "r");
  const information = await handle.stat();
  await handle.close();
  return { stream: createReadStream(artifactPath), byteSize: information.size };
}

export async function cleanupExpiredArtifacts(
  root: string,
  expiredBatchIds: readonly string[],
): Promise<number> {
  let removed = 0;
  for (const batchId of expiredBatchIds) {
    if (!/^[0-9a-f-]{36}$/.test(batchId)) continue;
    await rm(path.join(path.resolve(root), "batches", batchId), {
      recursive: true,
      force: true,
    });
    await rm(path.join(path.resolve(root), "runs", batchId), {
      recursive: true,
      force: true,
    });
    removed += 1;
  }
  return removed;
}

export async function listIncompleteRunDirectories(
  root: string,
): Promise<string[]> {
  const runsRoot = path.join(path.resolve(root), "runs");
  try {
    return (await readdir(runsRoot, { withFileTypes: true }))
      .filter(
        (entry) => entry.isDirectory() && /^[0-9a-f-]{36}$/.test(entry.name),
      )
      .map((entry) => path.join(runsRoot, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function artifactExists(
  root: string,
  key: string,
): Promise<boolean> {
  try {
    await stat(resolveArtifactPath(root, key));
    return true;
  } catch {
    return false;
  }
}
