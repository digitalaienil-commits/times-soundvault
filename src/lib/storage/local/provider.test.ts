import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalStorageProvider } from "./provider";

const roots: string[] = [];

function wavBytes(): Buffer {
  const buffer = Buffer.alloc(48);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(40, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(4, 40);
  return buffer;
}

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Response(Uint8Array.from(bytes).buffer).body!;
}

async function provider() {
  const root = await mkdtemp(path.join(tmpdir(), "soundvault-storage-"));
  roots.push(root);
  return { root, provider: new LocalStorageProvider(root) };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("local private storage provider", () => {
  it("writes sequential resumable chunks and atomically completes a valid WAV", async () => {
    const { root, provider: storage } = await provider();
    const bytes = wavBytes();
    const session = await storage.createUploadSession({
      sessionId: "11111111-1111-4111-8111-111111111111",
      submissionId: "22222222-2222-4222-8222-222222222222",
      revisionNumber: 1,
      audioFileId: "33333333-3333-4333-8333-333333333333",
      extension: ".wav",
      expectedByteSize: bytes.length,
    });
    await storage.writeChunk({
      reference: session.reference,
      body: stream(bytes.subarray(0, 20)),
      start: 0,
      end: 19,
      total: bytes.length,
    });
    expect(await storage.getUploadStatus(session.reference)).toMatchObject({
      uploadedByteSize: 20,
      completed: false,
    });
    await storage.writeChunk({
      reference: session.reference,
      body: stream(bytes.subarray(20)),
      start: 20,
      end: bytes.length - 1,
      total: bytes.length,
    });
    const object = await storage.verifyCompletedUpload({
      reference: session.reference,
      expectedByteSize: bytes.length,
      extension: ".wav",
    });
    expect(object).toMatchObject({
      storageBackend: "local",
      containerFormat: "wav",
      byteSize: bytes.length,
    });
    expect(object.storageKey).not.toContain("original");
    expect(await readFile(path.join(root, object.storageKey))).toEqual(bytes);
    await expect(
      readFile(path.join(root, `${object.storageKey}.part`)),
    ).rejects.toThrow();
  });

  it("rejects wrong ranges, spoofed signatures and unsafe storage keys", async () => {
    const { provider: storage } = await provider();
    const bytes = Buffer.from("MZ executable content");
    const session = await storage.createUploadSession({
      sessionId: "11111111-1111-4111-8111-111111111111",
      submissionId: "22222222-2222-4222-8222-222222222222",
      revisionNumber: 1,
      audioFileId: "33333333-3333-4333-8333-333333333333",
      extension: ".wav",
      expectedByteSize: bytes.length,
    });
    await expect(
      storage.writeChunk({
        reference: session.reference,
        body: stream(bytes),
        start: 1,
        end: bytes.length,
        total: bytes.length + 1,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RANGE" });
    await storage.writeChunk({
      reference: session.reference,
      body: stream(bytes),
      start: 0,
      end: bytes.length - 1,
      total: bytes.length,
    });
    await expect(
      storage.verifyCompletedUpload({
        reference: session.reference,
        expectedByteSize: bytes.length,
        extension: ".wav",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    await expect(
      storage.getUploadStatus({
        sessionId: "x",
        storageKey: "../public/attack.wav",
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_FAILURE" });
  });

  it("rolls back a streamed chunk that exceeds its declared range", async () => {
    const { provider: storage } = await provider();
    const bytes = wavBytes();
    const session = await storage.createUploadSession({
      sessionId: "11111111-1111-4111-8111-111111111111",
      submissionId: "22222222-2222-4222-8222-222222222222",
      revisionNumber: 1,
      audioFileId: "33333333-3333-4333-8333-333333333333",
      extension: ".wav",
      expectedByteSize: bytes.length,
    });
    await expect(
      storage.writeChunk({
        reference: session.reference,
        body: stream(bytes.subarray(0, 20)),
        start: 0,
        end: 9,
        total: bytes.length,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RANGE" });
    expect(await storage.getUploadStatus(session.reference)).toMatchObject({
      uploadedByteSize: 0,
      completed: false,
    });
  });

  it("cancels partial data without exposing a complete object", async () => {
    const { root, provider: storage } = await provider();
    const bytes = wavBytes();
    const session = await storage.createUploadSession({
      sessionId: "11111111-1111-4111-8111-111111111111",
      submissionId: "22222222-2222-4222-8222-222222222222",
      revisionNumber: 1,
      audioFileId: "33333333-3333-4333-8333-333333333333",
      extension: ".wav",
      expectedByteSize: bytes.length,
    });
    await storage.writeChunk({
      reference: session.reference,
      body: stream(bytes.subarray(0, 12)),
      start: 0,
      end: 11,
      total: bytes.length,
    });
    await storage.abortUpload(session.reference);
    expect(await storage.getUploadStatus(session.reference)).toEqual({
      uploadedByteSize: 0,
      completed: false,
    });
    expect(root).not.toContain("public");
  });
});
