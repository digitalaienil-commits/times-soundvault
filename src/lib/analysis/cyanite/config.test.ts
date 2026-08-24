import { describe, expect, it } from "vitest";

import { parseCyaniteConfig, parseCyaniteWebhookConfig } from "./config";

describe("Cyanite configuration", () => {
  it("keeps provider access-token validation strict when Cyanite is enabled", () => {
    expect(() =>
      parseCyaniteConfig({
        CYANITE_ENABLED: "true",
        NODE_ENV: "development",
      }),
    ).toThrow("CYANITE_ACCESS_TOKEN is required when Cyanite is enabled");
  });

  it("allows the development webhook test mode before credentials exist", () => {
    expect(
      parseCyaniteWebhookConfig({
        CYANITE_ENABLED: "true",
        CYANITE_WEBHOOK_ALLOW_UNSIGNED_TEST: "true",
        NODE_ENV: "development",
      }),
    ).toEqual({
      allowUnsignedTest: true,
      webhookSecret: undefined,
    });
  });

  it("forbids unsigned webhook test mode in production", () => {
    expect(() =>
      parseCyaniteWebhookConfig({
        CYANITE_ENABLED: "true",
        CYANITE_WEBHOOK_ALLOW_UNSIGNED_TEST: "true",
        CYANITE_WEBHOOK_SECRET: "secret",
        NODE_ENV: "production",
      }),
    ).toThrow("Unsigned Cyanite test webhooks are forbidden in production");
  });

  it("requires the webhook secret for enabled production delivery", () => {
    expect(() =>
      parseCyaniteWebhookConfig({
        CYANITE_ENABLED: "true",
        CYANITE_WEBHOOK_ALLOW_UNSIGNED_TEST: "false",
        NODE_ENV: "production",
      }),
    ).toThrow(
      "CYANITE_WEBHOOK_SECRET is required when Cyanite is enabled in production",
    );
  });
});
