import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  isRecognizedUnsignedCyaniteTest,
  parseCyaniteWebhook,
  verifyCyaniteWebhookSignature,
} from "./webhook";

const body = JSON.stringify({
  version: "2",
  resource: { type: "LibraryTrack", id: "track-1" },
  event: { type: "AudioAnalysisV6", status: "finished" },
});

describe("Cyanite webhook security", () => {
  it("verifies the exact raw body with HMAC-SHA512", () => {
    const signature = createHmac("sha512", "secret").update(body).digest("hex");
    expect(verifyCyaniteWebhookSignature(body, signature, "secret")).toBe(true);
    expect(
      verifyCyaniteWebhookSignature(`${body}\n`, signature, "secret"),
    ).toBe(false);
  });
  it("accepts the documented V6 completion event used for V7", () => {
    expect(parseCyaniteWebhook(body).resource.id).toBe("track-1");
  });
  it("rejects unrelated event types", () => {
    expect(() =>
      parseCyaniteWebhook(body.replace("AudioAnalysisV6", "AudioAnalysisV7")),
    ).toThrow(/supported V7/);
  });

  it("recognizes only the documented unsigned integration test event", () => {
    const testBody = JSON.stringify({ type: "TEST", data: null });

    expect(isRecognizedUnsignedCyaniteTest(testBody)).toBe(true);
    expect(
      isRecognizedUnsignedCyaniteTest(
        JSON.stringify({ type: "TEST", data: { unexpected: true } }),
      ),
    ).toBe(false);
    expect(
      isRecognizedUnsignedCyaniteTest(
        JSON.stringify({ type: "TEST", data: null, unexpected: true }),
      ),
    ).toBe(false);
    expect(isRecognizedUnsignedCyaniteTest(body)).toBe(false);
  });
});
