import "server-only";

import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const cyaniteEnvironmentSchema = z.object({
  CYANITE_ENABLED: booleanString,
  CYANITE_API_URL: z.url().default("https://api.cyanite.ai/graphql"),
  CYANITE_ACCESS_TOKEN: z.string().trim().optional(),
  CYANITE_WEBHOOK_SECRET: z.string().trim().optional(),
  CYANITE_WEBHOOK_ALLOW_UNSIGNED_TEST: booleanString,
  CYANITE_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),
  CYANITE_MAX_RETRIES: z.coerce.number().int().positive().default(5),
});

export interface CyaniteConfig {
  enabled: boolean;
  apiUrl: string;
  accessToken?: string;
  webhookSecret?: string;
  allowUnsignedTest: boolean;
  requestTimeoutMs: number;
  maxRetries: number;
}

export function parseCyaniteConfig(
  raw: Readonly<Record<string, string | undefined>> = process.env,
): CyaniteConfig {
  for (const key of Object.keys(raw)) {
    if (key.startsWith("NEXT_PUBLIC_") && key.includes("CYANITE")) {
      throw new Error(
        "Cyanite credentials must never use NEXT_PUBLIC_ variables",
      );
    }
  }
  const parsed = cyaniteEnvironmentSchema.parse(raw);
  if (parsed.CYANITE_ENABLED && !parsed.CYANITE_ACCESS_TOKEN) {
    throw new Error("CYANITE_ACCESS_TOKEN is required when Cyanite is enabled");
  }
  if (
    parsed.CYANITE_ENABLED &&
    raw.NODE_ENV === "production" &&
    !parsed.CYANITE_WEBHOOK_SECRET
  ) {
    throw new Error(
      "CYANITE_WEBHOOK_SECRET is required when Cyanite is enabled in production",
    );
  }
  if (
    raw.NODE_ENV === "production" &&
    parsed.CYANITE_WEBHOOK_ALLOW_UNSIGNED_TEST
  ) {
    throw new Error(
      "Unsigned Cyanite test webhooks are forbidden in production",
    );
  }
  return {
    enabled: parsed.CYANITE_ENABLED,
    apiUrl: parsed.CYANITE_API_URL,
    accessToken: parsed.CYANITE_ACCESS_TOKEN,
    webhookSecret: parsed.CYANITE_WEBHOOK_SECRET,
    allowUnsignedTest: parsed.CYANITE_WEBHOOK_ALLOW_UNSIGNED_TEST,
    requestTimeoutMs: parsed.CYANITE_REQUEST_TIMEOUT_MS,
    maxRetries: parsed.CYANITE_MAX_RETRIES,
  };
}
