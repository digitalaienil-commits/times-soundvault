import { parseCyaniteWebhookConfig } from "@/lib/analysis/cyanite/config";
import {
  cyaniteWebhookPayloadHash,
  isRecognizedUnsignedCyaniteTest,
  parseCyaniteWebhook,
  verifyCyaniteWebhookSignature,
} from "@/lib/analysis/cyanite/webhook";
import { receiveCyaniteWebhook } from "@/lib/analysis/repository";
import { getDatabase } from "@/lib/database/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const config = parseCyaniteWebhookConfig();
  if (config.allowUnsignedTest && isRecognizedUnsignedCyaniteTest(rawBody))
    return Response.json({ received: true, test: true });
  if (
    !config.webhookSecret ||
    !verifyCyaniteWebhookSignature(
      rawBody,
      request.headers.get("signature"),
      config.webhookSecret,
    )
  )
    return Response.json(
      { error: "Invalid webhook signature" },
      { status: 401 },
    );
  try {
    const payload = parseCyaniteWebhook(rawBody);
    const inserted = await receiveCyaniteWebhook(getDatabase(), {
      hash: cyaniteWebhookPayloadHash(rawBody),
      resourceType: payload.resource.type,
      resourceId: payload.resource.id,
      eventType: payload.event.type,
      status: payload.event.status,
    });
    return Response.json(
      { received: true, duplicate: !inserted },
      { status: 202 },
    );
  } catch {
    return Response.json(
      { error: "Unsupported webhook payload" },
      { status: 400 },
    );
  }
}
