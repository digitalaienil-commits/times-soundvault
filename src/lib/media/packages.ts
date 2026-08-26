import "server-only";

import { ZipArchive } from "archiver";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { calculateFileSha256 } from "@/lib/audio/checksum";
import { safeDownloadFilename } from "@/lib/http/content-disposition";
import { createStorageProviderForKind } from "@/lib/storage/factory";
import type { MediaConfig } from "./config";
import type { PackageSource } from "./repository";

function packageEntryName(source: PackageSource, index: number) {
  const extension = path.extname(source.originalFilename).toLowerCase();
  if (source.role === "master") {
    return `Master/${safeDownloadFilename(source.originalFilename)}`;
  }
  const label =
    source.stemLabel ?? source.stemType?.replaceAll("_", " ") ?? "Stem";
  const numbered = `${String(index + 1).padStart(2, "0")} - ${label}${extension}`;
  return `Stems/${safeDownloadFilename(numbered)}`;
}

export interface MaterializedPackageSource extends PackageSource {
  path: string;
}

export async function buildStoredPackage(input: {
  packageId: string;
  title: string;
  scope: "stems" | "full";
  revisionId: string;
  publishedAt: string;
  sources: PackageSource[];
  tempRoot: string;
  config: MediaConfig;
}) {
  const workRoot = path.join(input.tempRoot, input.packageId);
  const archivePath = path.join(workRoot, `${input.packageId}.zip`);
  await mkdir(workRoot, { recursive: true, mode: 0o700 });
  const materialized: MaterializedPackageSource[] = [];
  try {
    for (const [index, source] of input.sources.entries()) {
      const destination = path.join(
        workRoot,
        "sources",
        `${index}${path.extname(source.originalFilename).toLowerCase()}`,
      );
      const provider = createStorageProviderForKind(source.storageBackend);
      await provider.materializeStoredObject({
        storageKey: source.storageKey,
        providerDriveId: source.providerDriveId,
        providerItemId: source.providerItemId,
        destinationPath: destination,
      });
      if ((await calculateFileSha256(destination)) !== source.checksumSha256) {
        throw new Error("A package source failed checksum verification");
      }
      materialized.push({ ...source, path: destination });
    }
    const stableDate = new Date(input.publishedAt);
    const output = createWriteStream(archivePath, { flags: "wx", mode: 0o600 });
    const archive = new ZipArchive({
      store: true,
      forceZip64: true,
      forceLocalTime: false,
      statConcurrency: 2,
    });
    const completed = pipeline(archive, output);
    const manifest = {
      formatVersion: 1,
      title: input.title,
      scope: input.scope,
      publishedRevision: input.revisionId,
      files: materialized.map((source, index) => ({
        path: packageEntryName(source, index),
        role: source.role,
        checksumSha256: source.checksumSha256,
        byteSize: source.byteSize,
      })),
    };
    archive.append(Buffer.from(JSON.stringify(manifest, null, 2)), {
      name: "manifest.json",
      date: stableDate,
      mode: 0o644,
      store: true,
    });
    materialized.forEach((source, index) =>
      archive.append(createReadStream(source.path), {
        name: packageEntryName(source, index),
        date: stableDate,
        mode: 0o644,
        store: true,
      }),
    );
    await archive.finalize();
    await completed;
    const byteSize = (await stat(archivePath)).size;
    const checksumSha256 = await calculateFileSha256(archivePath);
    const storageKey = `generated/packages/${input.packageId}.zip`;
    const stored = await createStorageProviderForKind(
      input.sources[0]!.storageBackend,
    ).storeGeneratedObject({
      storageKey,
      sourcePath: archivePath,
      contentType: "application/zip",
      expectedByteSize: byteSize,
    });
    return { ...stored, checksumSha256 };
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

export function packageFilename(title: string, scope: "stems" | "full") {
  return safeDownloadFilename(
    `${title} - ${scope === "stems" ? "All Stems" : "Full Package"}.zip`,
  );
}
