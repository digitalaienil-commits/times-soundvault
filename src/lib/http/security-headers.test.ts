import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  getStaticSecurityHeaders,
} from "./security-headers";

function directive(policy: string, name: string): string {
  const found = policy
    .split("; ")
    .find((entry) => entry === name || entry.startsWith(`${name} `));
  return found ?? "";
}

describe("static security headers", () => {
  it("adds Strict-Transport-Security only in production", () => {
    const keys = (environment: string | undefined) =>
      getStaticSecurityHeaders(environment).map((header) => header.key);

    expect(keys("production")).toContain("Strict-Transport-Security");
    expect(keys("development")).not.toContain("Strict-Transport-Security");
    expect(keys(undefined)).not.toContain("Strict-Transport-Security");
  });

  it("denies framing and sniffing everywhere", () => {
    const headers = new Map(
      getStaticSecurityHeaders("production").map((header) => [
        header.key,
        header.value,
      ]),
    );

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Permissions-Policy")).toContain("microphone=()");
  });
});

describe("content security policy", () => {
  it("binds scripts to the request nonce and blocks framing", () => {
    const policy = buildContentSecurityPolicy("abc123", "production");

    expect(directive(policy, "script-src")).toContain("'nonce-abc123'");
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
  });

  it("never allows unsafe-eval outside development", () => {
    expect(buildContentSecurityPolicy("n", "production")).not.toContain(
      "'unsafe-eval'",
    );
    expect(buildContentSecurityPolicy("n", undefined)).not.toContain(
      "'unsafe-eval'",
    );
    expect(buildContentSecurityPolicy("n", "development")).toContain(
      "'unsafe-eval'",
    );
  });

  it("upgrades insecure requests outside development", () => {
    expect(buildContentSecurityPolicy("n", "production")).toContain(
      "upgrade-insecure-requests",
    );
    expect(buildContentSecurityPolicy("n", "development")).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("allows private preview playback from the same origin", () => {
    const policy = buildContentSecurityPolicy("n", "production");
    expect(directive(policy, "media-src")).toBe("media-src 'self' blob:");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
  });
});
