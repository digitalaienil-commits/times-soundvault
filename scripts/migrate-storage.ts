import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { getDatabase } from "../src/lib/database/database";
import { parseStorageConfig } from "../src/lib/storage/config";
import { createStorageProviderForKind } from "../src/lib/storage/factory";

/**
 * Moves objects written before a storage switch onto the current provider.
 *
 * Switching `STORAGE_PROVIDER` changes where new objects go and nothing about
 * where old ones are. The application reads both, so this is housekeeping
 * rather than a repair: it exists so the catalogue ends up in one place
 * instead of spread across a developer machine and SharePoint.
 *
 * It copies, verifies the copy by hash, and only then repoints the row. The
 * local file is never deleted: reversing a bad migration has to stay possible,
 * and reclaiming disk is a separate, deliberate act.
 */
interface Candidate {
  audioFileId: string;
  fileRole: string;
  storageKey: string;
  byteSize: number;
  checksum: string | null;
  uploadSessionId: string | null;
  playbackArtifactId: string | null;
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function hashStream(
  body: ReadableStream<Uint8Array>,
): Promise<{ digest: string; byteSize: number }> {
  const hash = createHash("sha256");
  let byteSize = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      hash.update(value);
      byteSize += value.byteLength;
    }
  }
  return { digest: hash.digest("hex"), byteSize };
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run against a production environment. Migrate storage from an operator session with an explicit plan.",
    );
  }
  const apply = process.argv.includes("--apply");
  const config = parseStorageConfig();
  if (config.provider !== "onedrive") {
    throw new Error(
      `STORAGE_PROVIDER is "${config.provider}". This migrates local objects onto OneDrive, so point the server at OneDrive first.`,
    );
  }

  const database = getDatabase();
  const candidates = await database.query<Candidate & Record<string, unknown>>(
    `SELECT file.id AS "audioFileId", file.file_role AS "fileRole",
            file.storage_key AS "storageKey", file.byte_size AS "byteSize",
            file.checksum_sha256 AS checksum,
            session.id AS "uploadSessionId",
            artifact.id AS "playbackArtifactId"
     FROM catalog.audio_file file
     LEFT JOIN workflow.upload_session session ON session.audio_file_id = file.id
     LEFT JOIN media.playback_artifact artifact ON artifact.preview_audio_file_id = file.id
     WHERE file.storage_backend = 'local' AND file.storage_key IS NOT NULL
     ORDER BY file.file_role, file.storage_key`,
  );

  if (candidates.rows.length === 0) {
    console.log("Nothing to migrate: no local objects remain.");
    await database.end();
    return;
  }

  console.log(
    `${apply ? "MIGRATING" : "DRY RUN"}: ${candidates.rows.length} objects from ${config.localRoot}`,
  );
  console.log(`Target drive: ${config.oneDrive?.driveId}\n`);

  const target = createStorageProviderForKind("onedrive");
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates.rows) {
    const byteSize = Number(row.byteSize);
    const sourcePath = path.resolve(config.localRoot, row.storageKey);
    const label = `${row.fileRole.padEnd(8)} ${row.storageKey}`;
    try {
      const stats = await stat(sourcePath);
      if (stats.size !== byteSize) {
        console.log(
          `  SKIP  ${label}\n        on disk ${stats.size} bytes, database says ${byteSize}`,
        );
        skipped += 1;
        continue;
      }
      const localDigest = await hashFile(sourcePath);
      if (row.checksum && row.checksum !== localDigest) {
        console.log(
          `  SKIP  ${label}\n        local file does not match its recorded checksum`,
        );
        skipped += 1;
        continue;
      }
      if (!apply) {
        console.log(`  READY ${label}  (${byteSize} bytes)`);
        migrated += 1;
        continue;
      }

      const stored = await target.storeGeneratedObject({
        storageKey: row.storageKey,
        sourcePath,
        contentType: row.storageKey.endsWith(".wav")
          ? "audio/wav"
          : row.storageKey.endsWith(".zip")
            ? "application/zip"
            : "audio/mpeg",
        expectedByteSize: byteSize,
      });

      // The row is repointed only after the bytes are read back off the new
      // provider and hashed. A successful upload call is not evidence that
      // what landed there is what left here.
      const opened = await target.openStoredObject({
        storageKey: row.storageKey,
        providerDriveId: stored.providerDriveId,
        providerItemId: stored.providerItemId,
        start: 0,
        end: byteSize - 1,
      });
      const remote = await hashStream(opened.body);
      if (remote.byteSize !== byteSize || remote.digest !== localDigest) {
        console.log(
          `  FAIL  ${label}\n        copy does not match the original; row left on local`,
        );
        failed += 1;
        continue;
      }

      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE catalog.audio_file SET storage_backend = 'onedrive' WHERE id = $1`,
          [row.audioFileId],
        );
        if (row.uploadSessionId) {
          await client.query(
            `UPDATE workflow.upload_session
             SET storage_backend = 'onedrive', provider_drive_id = $2, provider_item_id = $3
             WHERE id = $1`,
            [
              row.uploadSessionId,
              stored.providerDriveId,
              stored.providerItemId,
            ],
          );
        }
        if (row.playbackArtifactId) {
          await client.query(
            `UPDATE media.playback_artifact
             SET preview_provider_drive_id = $2, preview_provider_item_id = $3
             WHERE id = $1`,
            [
              row.playbackArtifactId,
              stored.providerDriveId,
              stored.providerItemId,
            ],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      console.log(`  DONE  ${label}  (${byteSize} bytes, hash verified)`);
      migrated += 1;
    } catch (error) {
      console.log(
        `  FAIL  ${label}\n        ${error instanceof Error ? error.message : String(error)}`,
      );
      failed += 1;
    }
  }

  console.log(
    `\n${apply ? "Migrated" : "Would migrate"} ${migrated}, skipped ${skipped}, failed ${failed}.`,
  );
  if (!apply) console.log("Re-run with --apply to perform the migration.");
  else if (migrated > 0) {
    console.log(
      `Local copies were kept under ${config.localRoot}. Remove them only after the catalogue has been checked.`,
    );
  }
  await database.end();
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Storage migration failed",
  );
  process.exitCode = 1;
});
