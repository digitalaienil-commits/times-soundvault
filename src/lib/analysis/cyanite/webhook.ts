import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const webhookSchema = z.object({
  version: z.literal("2"),
  resource: z.object({
    type: z.string().min(1).max(100),
    id: z.string().min(1).max(200),
  }),
  event: z.object({
    type: z.string().min(1).max(100),
    status: z.enum(["finished", "failed"]),
  }),
});

const unsignedTestSchema = z.object({
  version: z.literal("2"),
  resource: z.object({
    type: z.literal("IntegrationTest"),
    id: z.string().max(200),
  }),
  event: z.object({
    type: z.literal("IntegrationTest"),
    status: z.literal("test"),
  }),
});

export type CyaniteWebhookPayload = z.infer<typeof webhookSchema>;

export function verifyCyaniteWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parseCyaniteWebhook(rawBody: string): CyaniteWebhookPayload {
  if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) {
    throw new Error("Cyanite webhook payload is too large");
  }
  const parsed = webhookSchema.parse(JSON.parse(rawBody) as unknown);
  if (
    parsed.resource.type !== "LibraryTrack" ||
    parsed.event.type !== "AudioAnalysisV6"
  ) {
    throw new Error(
      "Cyanite webhook event is not a supported V7 completion signal",
    );
  }
  return parsed;
}

export function isRecognizedUnsignedCyaniteTest(rawBody: string): boolean {
  try {
    return unsignedTestSchema.safeParse(JSON.parse(rawBody) as unknown).success;
  } catch {
    return false;
  }
}

export function cyaniteWebhookPayloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
