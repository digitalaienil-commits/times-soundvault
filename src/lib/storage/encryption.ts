import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedProviderSession {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
}

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("Storage session encryption key must decode to 32 bytes");
  }
  return key;
}

export function encryptProviderSession(
  value: string,
  encodedKey: string,
  keyVersion = 1,
): EncryptedProviderSession {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

export function decryptProviderSession(
  encrypted: EncryptedProviderSession,
  encodedKey: string,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeKey(encodedKey),
    Buffer.from(encrypted.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
