import { describe, expect, it } from "vitest";

import type { AuthEnvironment } from "./environment-schema";
import { canUseLocalDirectSignIn } from "./local-direct-sign-in";

const localEnvironment: AuthEnvironment = {
  provider: "local",
  secret: "0123456789abcdef0123456789abcdef",
  baseUrl: "http://localhost:3000",
  trustedOrigins: ["http://localhost:3000"],
  databaseUrl: "postgresql://soundvault@localhost:5432/soundvault",
  local: {
    admin: {
      name: "Local Admin",
      email: "admin@soundvault.local",
      password: "local-admin-password",
    },
    musicProducer: {
      name: "Local Producer",
      email: "producer@soundvault.local",
      password: "local-producer-password",
    },
    coordinator: {
      name: "Local Coordinator",
      email: "coordinator@soundvault.local",
      password: "local-coordinator-password",
    },
    user: {
      name: "Local User",
      email: "user@soundvault.local",
      password: "local-user-password",
    },
  },
};

describe("local direct sign-in boundary", () => {
  it("allows the exact configured localhost origin in development", () => {
    expect(
      canUseLocalDirectSignIn(
        localEnvironment,
        "http://localhost:3000",
        "http://localhost:3000",
        "development",
      ),
    ).toBe(true);
  });

  it("rejects production, non-local origins and non-local providers", () => {
    expect(
      canUseLocalDirectSignIn(
        localEnvironment,
        "http://localhost:3000",
        "http://localhost:3000",
        "production",
      ),
    ).toBe(false);
    expect(
      canUseLocalDirectSignIn(
        localEnvironment,
        "https://soundvault.example",
        "https://soundvault.example",
        "development",
      ),
    ).toBe(false);
    expect(
      canUseLocalDirectSignIn(
        { ...localEnvironment, provider: "google", local: undefined },
        "http://localhost:3000",
        "http://localhost:3000",
        "development",
      ),
    ).toBe(false);
  });

  it("rejects missing and cross-site browser origins", () => {
    expect(
      canUseLocalDirectSignIn(
        localEnvironment,
        "http://localhost:3000",
        null,
        "development",
      ),
    ).toBe(false);
    expect(
      canUseLocalDirectSignIn(
        localEnvironment,
        "http://localhost:3000",
        "https://evil.example",
        "development",
      ),
    ).toBe(false);
  });
});
