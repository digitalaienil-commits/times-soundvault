import "server-only";

import { createWriteStream } from "node:fs";
import {
  link,
  mkdir,
  open,
  rm,
  stat,
  truncate,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { assertAudioSignature } from "../signature";
import type {
  CreateStorageUploadInput,
  DeleteDraftObjectInput,
  StorageProvider,
  StorageUploadSession,
  StorageUploadSessionReference,
  StorageUploadStatus,
  StoredObject,
  VerifyCompletedUploadInput,
  WriteStorageChunkInput,
} from "../provider";
import { StorageProviderError } from "../provider";

export class LocalStorageProvider implements StorageProvider {
  readonly kind = "local" as const;

  constructor(private readonly root: string) {}

  private resolveStorageKey(storageKey: string): string {
    if (
      !/^submissions\/[0-9a-f-]+\/revisions\/[1-9][0-9]*\/[0-9a-f-]+\.(?:wav|mp3)(?:\.part)?$/.test(
        storageKey,
      )
    ) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Local storage key is invalid",
      );
    }
    const resolved = path.resolve(this.root, storageKey);
    if (!resolved.startsWith(`${path.resolve(this.root)}${path.sep}`)) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Local storage key escapes its private root",
      );
    }
    return resolved;
  }

  async createUploadSession(
    input: CreateStorageUploadInput,
  ): Promise<StorageUploadSession> {
    const finalKey = `submissions/${input.submissionId}/revisions/${input.revisionNumber}/${input.audioFileId}${input.extension}`;
    const partKey = `${finalKey}.part`;
    const partPath = this.resolveStorageKey(partKey);
    await mkdir(path.dirname(partPath), { recursive: true, mode: 0o700 });
    try {
      const handle = await open(partPath, "wx", 0o600);
      await handle.close();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const uploadedByteSize = (await stat(partPath)).size;
    if (uploadedByteSize > input.expectedByteSize) {
      throw new StorageProviderError(
        "SIZE_MISMATCH",
        "Partial upload exceeds the expected size",
      );
    }
    return {
      reference: { sessionId: input.sessionId, storageKey: finalKey },
      uploadedByteSize,
    };
  }

  async getUploadStatus(
    reference: StorageUploadSessionReference,
  ): Promise<StorageUploadStatus> {
    const finalPath = this.resolveStorageKey(reference.storageKey);
    try {
      return {
        uploadedByteSize: (await stat(finalPath)).size,
        completed: true,
      };
    } catch {}
    try {
      return {
        uploadedByteSize: (await stat(`${finalPath}.part`)).size,
        completed: false,
      };
    } catch {
      return { uploadedByteSize: 0, completed: false };
    }
  }

  async writeChunk(
    input: WriteStorageChunkInput,
  ): Promise<StorageUploadStatus> {
    const partPath = `${this.resolveStorageKey(input.reference.storageKey)}.part`;
    const currentSize = (await stat(partPath)).size;
    if (
      input.start !== currentSize ||
      input.end < input.start ||
      input.end >= input.total
    ) {
      throw new StorageProviderError(
        "INVALID_RANGE",
        `Expected the next byte at ${currentSize}`,
      );
    }
    const expectedChunkBytes = input.end - input.start + 1;
    let received = 0;
    const source = Readable.fromWeb(input.body as never);
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > expectedChunkBytes) {
          callback(new Error("Chunk exceeds its declared Content-Range"));
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        source,
        limiter,
        createWriteStream(partPath, {
          flags: "r+",
          start: input.start,
          mode: 0o600,
        }),
      );
    } catch {
      await truncate(partPath, currentSize);
      throw new StorageProviderError(
        "INVALID_RANGE",
        "Chunk byte count does not match Content-Range",
      );
    }
    if (received !== expectedChunkBytes) {
      await truncate(partPath, currentSize);
      throw new StorageProviderError(
        "INVALID_RANGE",
        "Chunk byte count does not match Content-Range",
      );
    }
    const uploadedByteSize = (await stat(partPath)).size;
    return { uploadedByteSize, completed: uploadedByteSize === input.total };
  }

  async abortUpload(reference: StorageUploadSessionReference): Promise<void> {
    await rm(`${this.resolveStorageKey(reference.storageKey)}.part`, {
      force: true,
    });
  }

  async verifyCompletedUpload(
    input: VerifyCompletedUploadInput,
  ): Promise<StoredObject> {
    const finalPath = this.resolveStorageKey(input.reference.storageKey);
    const partPath = `${finalPath}.part`;
    const size = (await stat(partPath)).size;
    if (size !== input.expectedByteSize) {
      throw new StorageProviderError(
        "SIZE_MISMATCH",
        "Stored bytes do not match the registered file size",
      );
    }
    const prefix = Buffer.alloc(Math.min(8192, size));
    const handle = await open(partPath, "r");
    try {
      await handle.read(prefix, 0, prefix.length, 0);
    } finally {
      await handle.close();
    }
    let signature: Awaited<ReturnType<typeof assertAudioSignature>>;
    try {
      signature = await assertAudioSignature(prefix, input.extension);
    } catch {
      throw new StorageProviderError(
        "INVALID_SIGNATURE",
        "File signature is not a valid WAV or MP3",
      );
    }
    try {
      // A hard link is an atomic, no-overwrite publish on the same private
      // filesystem. Unlike rename(), it fails if a completed object already
      // exists, so generated keys can never silently replace stored audio.
      await link(partPath, finalPath);
      await unlink(partPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new StorageProviderError(
          "STORAGE_CONFLICT",
          "The generated storage object already exists",
        );
      }
      throw error;
    }
    return {
      storageBackend: "local",
      storageKey: input.reference.storageKey,
      byteSize: size,
      ...signature,
    };
  }

  async deleteDraftObject(input: DeleteDraftObjectInput): Promise<void> {
    const finalPath = this.resolveStorageKey(input.reference.storageKey);
    await Promise.all([
      rm(finalPath, { force: true }),
      rm(`${finalPath}.part`, { force: true }),
    ]);
  }
}
