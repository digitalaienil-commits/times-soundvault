import { describe, expect, it } from "vitest";

import { parseAuthEnvironment } from "./environment-schema";

function baseEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    AUTH_PROVIDER: "local",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    BETTER_AUTH_URL: "http://localhost:3000",
    AUTH_TRUSTED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
    DATABASE_URL: "postgresql://soundvault:password@localhost:5432/soundvault",
    LOCAL_ADMIN_NAME: "Admin",
    LOCAL_ADMIN_EMAIL: "admin@soundvault.local",
    LOCAL_ADMIN_PASSWORD: "admin-password-strong",
    LOCAL_PRODUCER_NAME: "Producer",
    LOCAL_PRODUCER_EMAIL: "producer@soundvault.local",
    LOCAL_PRODUCER_PASSWORD: "producer-password-strong",
    LOCAL_COORDINATOR_NAME: "Coordinator",
    LOCAL_COORDINATOR_EMAIL: "coordinator@soundvault.local",
    LOCAL_COORDINATOR_PASSWORD: "coordinator-password-strong",
    LOCAL_USER_NAME: "User",
    LOCAL_USER_EMAIL: "user@soundvault.local",
    LOCAL_USER_PASSWORD: "user-password-strong",
  };
}

describe("authentication environment", () => {
  it("accepts complete local configuration outside production", () => {
    expect(
      parseAuthEnvironment(baseEnvironment(), "development").provider,
    ).toBe("local");
  });

  it("rejects local mode in production", () => {
    expect(() => parseAuthEnvironment(baseEnvironment(), "production")).toThrow(
      "forbidden in production",
    );
  });

  it("requires every Google value and keeps the domain exact", () => {
    const raw = {
      ...baseEnvironment(),
      AUTH_PROVIDER: "google",
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GOOGLE_WORKSPACE_DOMAIN: "company.example",
    };
    expect(
      parseAuthEnvironment(raw, "development").google?.workspaceDomain,
    ).toBe("company.example");
    expect(() =>
      parseAuthEnvironment(
        { ...raw, GOOGLE_WORKSPACE_DOMAIN: "*.company.example" },
        "development",
      ),
    ).toThrow("one exact hosted domain");
    expect(() =>
      parseAuthEnvironment({ ...raw, GOOGLE_CLIENT_SECRET: "" }, "development"),
    ).toThrow("GOOGLE_CLIENT_SECRET is required");
  });

  it("requires an exact Microsoft tenant and rejects generic authorities", () => {
    const raw = {
      ...baseEnvironment(),
      AUTH_PROVIDER: "microsoft",
      MICROSOFT_CLIENT_ID: "microsoft-client",
      MICROSOFT_CLIENT_SECRET: "microsoft-secret",
      MICROSOFT_TENANT_ID: "2f4f87f0-7558-4b72-a24d-403a7f32a9dc",
    };
    expect(parseAuthEnvironment(raw, "development").microsoft?.tenantId).toBe(
      raw.MICROSOFT_TENANT_ID,
    );
    expect(() =>
      parseAuthEnvironment(
        { ...raw, MICROSOFT_TENANT_ID: "common" },
        "development",
      ),
    ).toThrow("one exact tenant");
  });

  it("rejects missing secrets, wildcard origins and insecure production URLs", () => {
    expect(() =>
      parseAuthEnvironment({
        ...baseEnvironment(),
        BETTER_AUTH_SECRET: "short",
      }),
    ).toThrow("at least 32 characters");
    expect(() =>
      parseAuthEnvironment({
        ...baseEnvironment(),
        AUTH_TRUSTED_ORIGINS: "http://*.example.com",
      }),
    ).toThrow("wildcards");
    const googleProduction = {
      ...baseEnvironment(),
      AUTH_PROVIDER: "google",
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GOOGLE_WORKSPACE_DOMAIN: "company.example",
    };
    expect(() => parseAuthEnvironment(googleProduction, "production")).toThrow(
      "must use HTTPS",
    );
  });
});
