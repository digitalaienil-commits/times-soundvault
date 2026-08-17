import { describe, expect, it } from "vitest";

import { sanitizeCallbackUrl } from "./callback-url";

describe("safe callback URLs", () => {
  it.each([
    "/dashboard",
    "/library?query=calm&page=2",
    "/my-uploads",
    "/upload",
    "/review",
    "/demands",
    "/team?status=pending",
    "/admin",
  ])("allows the internal callback %s", (callback) => {
    expect(sanitizeCallbackUrl(callback, "/library")).toBe(callback);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "data:text/html,hello",
    "\\\\evil.example",
    "/api/auth/sign-out",
    "/sign-in",
    "/auth/error",
    "/library%2f..%2fadmin",
    "/library%5c..%5cadmin",
  ])("rejects the callback %s", (callback) => {
    expect(sanitizeCallbackUrl(callback, "/library")).toBe("/library");
  });
});
