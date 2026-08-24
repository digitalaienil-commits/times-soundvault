// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDatabase, receiveCyaniteWebhook } = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  receiveCyaniteWebhook: vi.fn(),
}));

vi.mock("@/lib/analysis/repository", () => ({ receiveCyaniteWebhook }));
vi.mock("@/lib/database/database", () => ({ getDatabase }));

import { POST } from "./route";

const integrationTestBody = JSON.stringify({
  version: "2",
  resource: { type: "IntegrationTest", id: "test-1" },
  event: { type: "IntegrationTest", status: "test" },
});

describe("Cyanite webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CYANITE_ENABLED", "true");
    vi.stubEnv("CYANITE_WEBHOOK_ALLOW_UNSIGNED_TEST", "true");
    vi.stubEnv("NODE_ENV", "development");
  });

  it("accepts the recognized unsigned development test without credentials", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/cyanite", {
        method: "POST",
        body: integrationTestBody,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      test: true,
    });
    expect(getDatabase).not.toHaveBeenCalled();
    expect(receiveCyaniteWebhook).not.toHaveBeenCalled();
  });

  it("rejects an unsigned non-test event without touching the database", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/cyanite", {
        method: "POST",
        body: integrationTestBody.replace(
          '"status":"test"',
          '"status":"finished"',
        ),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid webhook signature",
    });
    expect(getDatabase).not.toHaveBeenCalled();
    expect(receiveCyaniteWebhook).not.toHaveBeenCalled();
  });
});
