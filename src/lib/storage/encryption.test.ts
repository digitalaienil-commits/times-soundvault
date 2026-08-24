import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptProviderSession, encryptProviderSession } from "./encryption";

describe("provider session encryption", () => {
  it("round-trips a bearer-like upload URL without serializing plaintext", () => {
    const key = randomBytes(32).toString("base64");
    const uploadUrl = "https://upload.example.test/session?secret=never-log";
    const encrypted = encryptProviderSession(uploadUrl, key);
    expect(JSON.stringify(encrypted)).not.toContain(uploadUrl);
    expect(decryptProviderSession(encrypted, key)).toBe(uploadUrl);
  });
  it("fails with the wrong key or modified ciphertext", () => {
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptProviderSession("secret", key);
    expect(() =>
      decryptProviderSession(encrypted, randomBytes(32).toString("base64")),
    ).toThrow();
    expect(() =>
      decryptProviderSession(
        {
          ...encrypted,
          ciphertext: Buffer.from(
            Buffer.from(encrypted.ciphertext, "base64").map((byte, index) =>
              index === 0 ? byte ^ 1 : byte,
            ),
          ).toString("base64"),
        },
        key,
      ),
    ).toThrow();
  });
});
