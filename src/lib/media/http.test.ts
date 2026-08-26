import { beforeEach, describe, expect, it, vi } from "vitest";

const openStoredObject = vi.fn();
const abortStoredObject = vi.fn();
vi.mock("@/lib/storage/factory", () => ({
  createStorageProviderForKind: () => ({ openStoredObject }),
}));

import { mediaObjectResponse } from "./http";

const object = {
  storageBackend: "local" as const,
  storageKey: "generated/previews/00000000-0000-4000-8000-000000000001.mp3",
  providerDriveId: null,
  providerItemId: null,
  byteSize: 10,
  contentType: "audio/mpeg",
  checksumSha256: "a".repeat(64),
  originalFilename: "संगीत.mp3",
};

describe("protected media HTTP responses", () => {
  beforeEach(() => {
    openStoredObject.mockReset();
    openStoredObject.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("2345"));
          controller.close();
        },
      }),
      contentLength: 4,
      abort: abortStoredObject,
    });
    abortStoredObject.mockReset();
  });

  it("streams a single range with strong validators and private headers", async () => {
    const controller = new AbortController();
    const response = await mediaObjectResponse(
      new Request("https://soundvault.test/audio", {
        headers: { Range: "bytes=2-5" },
        signal: controller.signal,
      }),
      object,
      "inline",
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("etag")).toBe(`"${"a".repeat(64)}"`);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(await response.text()).toBe("2345");
    expect(openStoredObject).toHaveBeenCalledWith(
      expect.objectContaining({ start: 2, end: 5 }),
    );
    expect(openStoredObject.mock.calls[0]?.[0]).not.toHaveProperty("signal");
  });

  it("aborts the underlying provider stream after the response is created", async () => {
    const controller = new AbortController();
    await mediaObjectResponse(
      new Request("https://soundvault.test/audio", {
        signal: controller.signal,
      }),
      object,
      "inline",
    );
    controller.abort();
    expect(abortStoredObject).toHaveBeenCalledOnce();
  });

  it("returns metadata-only HEAD and 416 for multiple ranges", async () => {
    const head = await mediaObjectResponse(
      new Request("https://soundvault.test/audio", {
        method: "HEAD",
        headers: { Range: "bytes=-4" },
      }),
      object,
      "attachment",
    );
    expect(head.status).toBe(206);
    expect(head.headers.get("content-length")).toBe("4");
    expect(head.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''",
    );
    expect(openStoredObject).not.toHaveBeenCalled();
    const invalid = await mediaObjectResponse(
      new Request("https://soundvault.test/audio", {
        headers: { Range: "bytes=0-1,4-5" },
      }),
      object,
      "inline",
    );
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */10");
  });

  it("ignores Range after an If-Range mismatch", async () => {
    await mediaObjectResponse(
      new Request("https://soundvault.test/audio", {
        headers: { Range: "bytes=2-5", "If-Range": '"old"' },
      }),
      object,
      "inline",
    );
    expect(openStoredObject).toHaveBeenCalledWith(
      expect.objectContaining({ start: 0, end: 9 }),
    );
  });
});
