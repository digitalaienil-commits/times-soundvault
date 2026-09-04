import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  OneDriveStorageProvider,
  assertValidOneDriveChunkSize,
} from "./provider";

const config = {
  tenantId: "tenant",
  clientId: "client",
  clientSecret: "secret",
  siteId: "site",
  driveId: "drive-1",
  rootItemId: "root-1",
};

const createInput = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  submissionId: "22222222-2222-4222-8222-222222222222",
  revisionNumber: 1,
  audioFileId: "33333333-3333-4333-8333-333333333333",
  extension: ".wav" as const,
  expectedByteSize: 4,
};

function json(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("OneDrive SharePoint storage adapter", () => {
  it("requests a server token and creates a fail-on-conflict session below the configured root", async () => {
    const token = vi.fn(async () => "app-token");
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const request: typeof fetch = async (url, init) => {
      calls.push([url, init]);
      return json({
        uploadUrl: "https://upload.example/session?bearer=secret",
        expirationDateTime: "2026-08-25T00:00:00Z",
      });
    };
    const provider = new OneDriveStorageProvider(config, request, token);
    const result = await provider.createUploadSession(createInput);
    expect(token).toHaveBeenCalledOnce();
    const [url, init] = calls[0]!;
    expect(String(url)).toContain(
      `/drives/${config.driveId}/items/${config.rootItemId}:/`,
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer app-token",
    );
    expect(String(init?.body)).toContain("@microsoft.graph.conflictBehavior");
    expect(String(init?.body)).toContain("fail");
    expect(result.reference.storageKey).toBe(`${createInput.audioFileId}.wav`);
  });

  it("sends upload chunks without an Authorization header and respects nextExpectedRanges", async () => {
    const request = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe("PUT");
        expect(new Headers(init?.headers).has("Authorization")).toBe(false);
        return json({ nextExpectedRanges: ["327680-"] }, { status: 202 });
      },
    );
    const provider = new OneDriveStorageProvider(
      config,
      request as typeof fetch,
      async () => "token",
    );
    const status = await provider.writeChunk({
      reference: {
        sessionId: createInput.sessionId,
        storageKey: `${createInput.audioFileId}.wav`,
        uploadUrl: "https://upload.example/session",
      },
      body: new Response(new Uint8Array(320 * 1024)).body!,
      start: 0,
      end: 320 * 1024 - 1,
      total: 640 * 1024,
    });
    expect(status).toMatchObject({
      uploadedByteSize: 320 * 1024,
      completed: false,
      nextExpectedRanges: ["327680-"],
    });
  });

  it("retries 429 and transient failures without logging the upload URL", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const responses = [
      new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
      new Response(null, { status: 503 }),
      json({ nextExpectedRanges: ["327680-"] }, { status: 202 }),
    ];
    const request = vi.fn(async () => responses.shift()!);
    const provider = new OneDriveStorageProvider(
      config,
      request as typeof fetch,
      async () => "token",
    );
    await provider.writeChunk({
      reference: {
        sessionId: "session",
        storageKey: "file.wav",
        uploadUrl: "https://upload.example/private-secret",
      },
      body: new Response(new Uint8Array(320 * 1024)).body!,
      start: 0,
      end: 320 * 1024 - 1,
      total: 640 * 1024,
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("rejects expired sessions and independently verifies Drive item identity", async () => {
    const expired = new OneDriveStorageProvider(
      config,
      vi.fn(async () => new Response(null, { status: 410 })) as typeof fetch,
      async () => "token",
    );
    await expect(
      expired.writeChunk({
        reference: {
          sessionId: "session",
          storageKey: "file.wav",
          uploadUrl: "https://upload.example/session",
        },
        body: new Response(new Uint8Array([1])).body!,
        start: 0,
        end: 0,
        total: 1,
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });

    const request = vi.fn(async () =>
      json({
        id: "wrong-item",
        name: "file.wav",
        size: 4,
        parentReference: { driveId: "drive-1", id: "root-1" },
      }),
    );
    const provider = new OneDriveStorageProvider(
      config,
      request as typeof fetch,
      async () => "token",
    );
    await expect(
      provider.verifyCompletedUpload({
        reference: {
          sessionId: "session",
          storageKey: "file.wav",
          driveId: "drive-1",
          itemId: "item-1",
        },
        expectedByteSize: 4,
        extension: ".wav",
      }),
    ).rejects.toMatchObject({ code: "SIZE_MISMATCH" });
  });

  it("enforces Microsoft Graph chunk multiples", () => {
    expect(() => assertValidOneDriveChunkSize(10 * 1024 * 1024)).not.toThrow();
    expect(() => assertValidOneDriveChunkSize(1024)).toThrow(/320 KiB/);
  });

  it("allows generated previews and AI draft source objects", async () => {
    const source = new Uint8Array([1, 2, 3, 4]);
    const request = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") {
          return json({ uploadUrl: "https://upload.example/generated" });
        }
        return json({
          id: "generated-item",
          size: source.byteLength,
        });
      },
    );
    const provider = new OneDriveStorageProvider(
      config,
      request as typeof fetch,
      async () => "token",
    );
    const tempPath = `/private/tmp/${randomUUID()}.wav`;
    await writeFile(tempPath, source);

    try {
      await expect(
        provider.storeGeneratedObject({
          storageKey:
            "generated/previews/11111111-1111-4111-8111-111111111111.wav",
          sourcePath: tempPath,
          contentType: "audio/wav",
          expectedByteSize: source.byteLength,
        }),
      ).resolves.toMatchObject({ storageKey: expect.stringContaining(".wav") });
      await expect(
        provider.storeGeneratedObject({
          storageKey:
            "submissions/22222222-2222-4222-8222-222222222222/revisions/1/33333333-3333-4333-8333-333333333333.mp3",
          sourcePath: tempPath,
          contentType: "audio/mpeg",
          expectedByteSize: source.byteLength,
        }),
      ).resolves.toMatchObject({
        storageKey: expect.stringContaining("submissions/"),
      });
    } finally {
      await rm(tempPath, { force: true });
    }
  });

  it("streams a bounded server-authorized content range without exposing Graph", async () => {
    const request = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer token",
        );
        expect(new Headers(init?.headers).get("Range")).toBe("bytes=10-19");
        return new Response(new Uint8Array(10), { status: 206 });
      },
    );
    const provider = new OneDriveStorageProvider(
      config,
      request as typeof fetch,
      async () => "token",
    );
    const opened = await provider.openStoredObject({
      storageKey: "private.wav",
      providerDriveId: "drive-1",
      providerItemId: "item-1",
      start: 10,
      end: 19,
    });
    expect(opened.contentLength).toBe(10);
    expect(request).toHaveBeenCalledOnce();
  });

  it("rejects a non-final chunk that is not a 320 KiB multiple", async () => {
    const provider = new OneDriveStorageProvider(
      config,
      vi.fn() as typeof fetch,
      async () => "token",
    );
    await expect(
      provider.writeChunk({
        reference: {
          sessionId: "session",
          storageKey: "file.wav",
          uploadUrl: "https://upload.example/session",
        },
        body: new Response(new Uint8Array(1024)).body!,
        start: 0,
        end: 1023,
        total: 2048,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RANGE" });
  });
});
