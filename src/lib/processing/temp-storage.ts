import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export interface ProcessingRunDirectory {
  id: string;
  path: string;
  objectPath(extension: ".wav" | ".mp3"): string;
  derivativePath(): string;
  cleanup(): Promise<void>;
}

export async function createProcessingRunDirectory(
  root: string,
): Promise<ProcessingRunDirectory> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const runPath = path.join(root, id);
  await mkdir(runPath, { mode: 0o700 });
  return {
    id,
    path: runPath,
    objectPath: (extension) =>
      path.join(runPath, `${randomUUID()}${extension}`),
    derivativePath: () => path.join(runPath, `${randomUUID()}.mp3`),
    cleanup: () => rm(runPath, { recursive: true, force: true }),
  };
}

export async function listStaleProcessingDirectories(
  root: string,
  olderThan: Date,
): Promise<Array<{ path: string; modifiedAt: Date }>> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const stale: Array<{ path: string; modifiedAt: Date }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/.test(entry.name)) continue;
    const candidate = path.join(root, entry.name);
    const information = await stat(candidate);
    if (information.mtime < olderThan) {
      stale.push({ path: candidate, modifiedAt: information.mtime });
    }
  }
  return stale.sort(
    (left, right) => left.modifiedAt.getTime() - right.modifiedAt.getTime(),
  );
}

export async function removeStaleProcessingDirectory(
  root: string,
  candidate: string,
): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (
    path.dirname(resolvedCandidate) !== resolvedRoot ||
    !/^[0-9a-f-]{36}$/.test(path.basename(resolvedCandidate))
  ) {
    throw new Error("Processing cleanup target is outside the private root");
  }
  await rm(resolvedCandidate, { recursive: true, force: true });
}
