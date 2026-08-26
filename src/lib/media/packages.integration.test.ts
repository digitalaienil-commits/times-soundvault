import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { calculateFileSha256 } from "@/lib/audio/checksum";
import { parseMediaConfig } from "./config";
import { buildStoredPackage } from "./packages";
import type { PackageSource } from "./repository";

const execute = promisify(execFile);

describe("deterministic delivery ZIP", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("stores exact Master/Stem bytes and a safe manifest using ZIP64 STORE", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundvault-package-"));
    roots.push(root);
    const storageRoot = path.join(root, "private");
    process.env.STORAGE_PROVIDER = "local";
    process.env.LOCAL_STORAGE_ROOT = storageRoot;
    const submissionId = randomUUID();
    const revisionId = randomUUID();
    const inputs = [
      { role: "master" as const, name: "Master.wav", bytes: "master-source" },
      { role: "stem" as const, name: "../Drums.wav", bytes: "stem-source" },
    ];
    const sources: PackageSource[] = [];
    for (const [index, input] of inputs.entries()) {
      const fileId = randomUUID();
      const key = `submissions/${submissionId}/revisions/1/${fileId}.wav`;
      const filePath = path.join(storageRoot, key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, input.bytes);
      sources.push({
        audioAssetId: randomUUID(),
        audioFileId: fileId,
        role: input.role,
        stemLabel: input.role === "stem" ? "Drums" : null,
        stemType: input.role === "stem" ? "drums" : null,
        sortOrder: index,
        originalFilename: input.name,
        storageBackend: "local",
        storageKey: key,
        providerDriveId: null,
        providerItemId: null,
        byteSize: Buffer.byteLength(input.bytes),
        checksumSha256: await calculateFileSha256(filePath),
      });
    }
    const config = parseMediaConfig({
      MEDIA_TEMP_ROOT: path.join(root, "work"),
    });
    const firstId = randomUUID();
    const first = await buildStoredPackage({
      packageId: firstId,
      title: "News / Theme",
      scope: "full",
      revisionId,
      publishedAt: "2026-08-26T00:00:00.000Z",
      sources,
      tempRoot: config.tempRoot,
      config,
    });
    const archivePath = path.join(storageRoot, first.storageKey);
    const listing = await execute("unzip", ["-lv", archivePath]);
    expect(listing.stdout).toContain("manifest.json");
    expect(listing.stdout).toContain("Master/Master.wav");
    expect(listing.stdout).toContain("Stems/02 - Drums.wav");
    const manifest = await execute("unzip", [
      "-p",
      archivePath,
      "manifest.json",
    ]);
    expect(JSON.parse(manifest.stdout)).toMatchObject({
      formatVersion: 1,
      scope: "full",
      publishedRevision: revisionId,
    });
    expect(manifest.stdout).not.toContain("storageKey");
    const secondId = randomUUID();
    const second = await buildStoredPackage({
      packageId: secondId,
      title: "News / Theme",
      scope: "full",
      revisionId,
      publishedAt: "2026-08-26T00:00:00.000Z",
      sources,
      tempRoot: config.tempRoot,
      config,
    });
    expect(second.checksumSha256).toBe(first.checksumSha256);
  }, 30_000);
});
