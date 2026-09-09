import { afterEach, describe, expect, it } from "vitest";

import { signInAttemptLimit } from "./auth-factory";

const original = process.env.AUTH_SIGN_IN_RATE_LIMIT_MAX;

afterEach(() => {
  if (original === undefined) {
    delete process.env.AUTH_SIGN_IN_RATE_LIMIT_MAX;
  } else {
    process.env.AUTH_SIGN_IN_RATE_LIMIT_MAX = original;
  }
});

describe("sign-in attempt limit", () => {
  it("ignores the environment in production", () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT_MAX = "1000";
    expect(signInAttemptLimit("production")).toBe(8);
  });

  it("keeps the hardened default when nothing is configured", () => {
    delete process.env.AUTH_SIGN_IN_RATE_LIMIT_MAX;
    expect(signInAttemptLimit("development")).toBe(8);
  });

  it("never lets the environment lower the hardened default", () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT_MAX = "1";
    expect(signInAttemptLimit("development")).toBe(8);
  });

  it("allows a higher ceiling outside production for the e2e suite", () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT_MAX = "200";
    expect(signInAttemptLimit("test")).toBe(200);
  });

  it("rejects values that are not safe integers", () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT_MAX = "not-a-number";
    expect(signInAttemptLimit("development")).toBe(8);
  });
});
