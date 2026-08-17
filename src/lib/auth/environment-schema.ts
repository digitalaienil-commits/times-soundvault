import { z } from "zod";

import type { AuthProvider } from "@/types/auth";

const GENERIC_MICROSOFT_TENANTS = new Set([
  "common",
  "organizations",
  "consumers",
]);

const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const secretSchema = z.string().min(32, "must contain at least 32 characters");
const passwordSchema = z
  .string()
  .min(12, "must contain at least 12 characters");

export interface LocalIdentityConfig {
  name: string;
  email: string;
  password: string;
}

export interface AuthEnvironment {
  provider: AuthProvider;
  secret: string;
  baseUrl: string;
  trustedOrigins: readonly string[];
  databaseUrl: string;
  google?: {
    clientId: string;
    clientSecret: string;
    workspaceDomain: string;
  };
  microsoft?: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
  };
  local?: {
    admin: LocalIdentityConfig;
    musicProducer: LocalIdentityConfig;
    coordinator: LocalIdentityConfig;
    user: LocalIdentityConfig;
  };
}

function readRequired(raw: NodeJS.ProcessEnv, name: string): string {
  const value = raw[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseOrigin(value: string, production: boolean): string {
  if (value.includes("*")) {
    throw new Error("AUTH_TRUSTED_ORIGINS cannot contain wildcards");
  }

  const url = new URL(value);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Trusted origins must be exact origins without paths or credentials",
    );
  }
  if (production && url.protocol !== "https:") {
    throw new Error("Production authentication origins must use HTTPS");
  }
  if (
    !production &&
    url.protocol !== "https:" &&
    !(isLocal && url.protocol === "http:")
  ) {
    throw new Error(
      "HTTP authentication origins are allowed only for localhost",
    );
  }
  return url.origin;
}

function parseBaseUrl(value: string, production: boolean): string {
  const url = new URL(value);
  const origin = parseOrigin(url.origin, production);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("BETTER_AUTH_URL must be an origin without a path");
  }
  return origin;
}

function parseLocalIdentity(
  raw: NodeJS.ProcessEnv,
  prefix: "ADMIN" | "PRODUCER" | "COORDINATOR" | "USER",
): LocalIdentityConfig {
  return {
    name: readRequired(raw, `LOCAL_${prefix}_NAME`),
    email: emailSchema.parse(readRequired(raw, `LOCAL_${prefix}_EMAIL`)),
    password: passwordSchema.parse(
      readRequired(raw, `LOCAL_${prefix}_PASSWORD`),
    ),
  };
}

export function parseAuthEnvironment(
  raw: NodeJS.ProcessEnv,
  nodeEnvironment = raw.NODE_ENV,
): AuthEnvironment {
  const production = nodeEnvironment === "production";
  const provider = z
    .enum(["google", "microsoft", "local"])
    .parse(readRequired(raw, "AUTH_PROVIDER"));

  if (provider === "local" && production) {
    throw new Error("AUTH_PROVIDER=local is forbidden in production");
  }

  const baseUrl = parseBaseUrl(
    readRequired(raw, "BETTER_AUTH_URL"),
    production,
  );
  const trustedOrigins = readRequired(raw, "AUTH_TRUSTED_ORIGINS")
    .split(",")
    .map((origin) => parseOrigin(origin.trim(), production));

  if (!trustedOrigins.includes(baseUrl)) {
    throw new Error("AUTH_TRUSTED_ORIGINS must include BETTER_AUTH_URL");
  }

  const config: AuthEnvironment = {
    provider,
    secret: secretSchema.parse(readRequired(raw, "BETTER_AUTH_SECRET")),
    baseUrl,
    trustedOrigins,
    databaseUrl: z.string().url().parse(readRequired(raw, "DATABASE_URL")),
  };

  if (provider === "google") {
    const workspaceDomain = readRequired(
      raw,
      "GOOGLE_WORKSPACE_DOMAIN",
    ).toLowerCase();
    if (workspaceDomain.includes("*") || workspaceDomain.includes("@")) {
      throw new Error(
        "GOOGLE_WORKSPACE_DOMAIN must be one exact hosted domain",
      );
    }
    config.google = {
      clientId: readRequired(raw, "GOOGLE_CLIENT_ID"),
      clientSecret: readRequired(raw, "GOOGLE_CLIENT_SECRET"),
      workspaceDomain,
    };
  }

  if (provider === "microsoft") {
    const tenantId = readRequired(raw, "MICROSOFT_TENANT_ID").toLowerCase();
    if (GENERIC_MICROSOFT_TENANTS.has(tenantId)) {
      throw new Error("MICROSOFT_TENANT_ID must identify one exact tenant");
    }
    z.string().uuid().parse(tenantId);
    config.microsoft = {
      clientId: readRequired(raw, "MICROSOFT_CLIENT_ID"),
      clientSecret: readRequired(raw, "MICROSOFT_CLIENT_SECRET"),
      tenantId,
    };
  }

  if (provider === "local") {
    config.local = {
      admin: parseLocalIdentity(raw, "ADMIN"),
      musicProducer: parseLocalIdentity(raw, "PRODUCER"),
      coordinator: parseLocalIdentity(raw, "COORDINATOR"),
      user: parseLocalIdentity(raw, "USER"),
    };
  }

  return config;
}
