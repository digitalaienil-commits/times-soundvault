import { describe, expect, it } from "vitest";

import { readJsonBody } from "./request-body";

function jsonRequest(body: string, contentLength?: string): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: contentLength ? { "content-length": contentLength } : undefined,
    body,
  });
}

describe("readJsonBody", () => {
  it("parses a body inside the limit", async () => {
    const result = await readJsonBody<{ action: string }>(
      jsonRequest(JSON.stringify({ action: "generate" })),
    );

    expect(result).toEqual({ kind: "ok", value: { action: "generate" } });
  });

  it("rejects a body that declares more than the limit", async () => {
    const result = await readJsonBody(jsonRequest("{}", "999999"), 1024);

    expect(result).toEqual({ kind: "too-large" });
  });

  it("rejects a body that exceeds the limit while streaming", async () => {
    // No Content-Length is declared, so only the streamed length can stop it.
    const oversized = new Request("http://localhost/api/test", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("x".repeat(2048)));
          controller.close();
        },
      }),
      // @ts-expect-error duplex is required for a streaming request body
      duplex: "half",
    });

    expect(await readJsonBody(oversized, 1024)).toEqual({ kind: "too-large" });
  });

  it("reports invalid JSON without throwing", async () => {
    expect(await readJsonBody(jsonRequest("{not json"))).toEqual({
      kind: "invalid",
    });
  });

  it("rejects a malformed content-length", async () => {
    expect(await readJsonBody(jsonRequest("{}", "abc"))).toEqual({
      kind: "invalid",
    });
  });
});
