import type { Pool } from "pg";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";

import type { AuthEnvironment } from "./environment-schema";
import {
  activateTeamAccessForIdentity,
  findPendingTeamAccessByEmail,
  requireActiveTeamAccess,
  TeamAccessError,
} from "./team-access-repository";
import { SESSION_POLICY } from "./constants";

function accessError(error: unknown, stage: "ACCOUNT" | "SESSION"): APIError {
  if (error instanceof TeamAccessError) {
    return new APIError("FORBIDDEN", { message: `${stage}_${error.code}` });
  }
  return new APIError("INTERNAL_SERVER_ERROR", {
    message: "AUTHORIZATION_CHECK_FAILED",
  });
}

function toSoundVaultProvider(providerId: string) {
  if (providerId === "credential") {
    return "local" as const;
  }
  if (providerId === "google" || providerId === "microsoft") {
    return providerId;
  }
  throw new APIError("FORBIDDEN", { message: "UNSUPPORTED_AUTH_PROVIDER" });
}

export function createSoundVaultAuth(
  environment: AuthEnvironment,
  database: Pool,
  options: { allowLocalSignUp?: boolean } = {},
) {
  const socialProviders =
    environment.provider === "google" && environment.google
      ? {
          google: {
            clientId: environment.google.clientId,
            clientSecret: environment.google.clientSecret,
            hd: environment.google.workspaceDomain,
            scope: ["openid", "email", "profile"],
            prompt: "select_account" as const,
          },
        }
      : environment.provider === "microsoft" && environment.microsoft
        ? {
            microsoft: {
              clientId: environment.microsoft.clientId,
              clientSecret: environment.microsoft.clientSecret,
              tenantId: environment.microsoft.tenantId,
              authority: "https://login.microsoftonline.com",
              scope: ["openid", "email", "profile"],
              prompt: "select_account" as const,
              disableProfilePhoto: true,
            },
          }
        : undefined;

  return betterAuth({
    appName: "Times SoundVault",
    baseURL: environment.baseUrl,
    secret: environment.secret,
    trustedOrigins: [...environment.trustedOrigins],
    database,
    emailAndPassword:
      environment.provider === "local"
        ? {
            enabled: true,
            disableSignUp: !options.allowLocalSignUp,
            minPasswordLength: 12,
            maxPasswordLength: 128,
          }
        : { enabled: false },
    socialProviders,
    user: {
      additionalFields: {
        role: {
          type: ["admin", "music_producer", "coordinator", "user"],
          required: false,
          input: false,
          returned: true,
        },
      },
    },
    session: {
      expiresIn: SESSION_POLICY.expiresInSeconds,
      updateAge: SESSION_POLICY.updateAgeSeconds,
      freshAge: SESSION_POLICY.freshAgeSeconds,
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      storeAccountCookie: false,
      accountLinking: {
        enabled: false,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-in/social": { window: 60, max: 20 },
      },
    },
    advanced: {
      useSecureCookies: environment.baseUrl.startsWith("https://"),
    },
    onAPIError: {
      errorURL: "/auth/error",
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const access = await findPendingTeamAccessByEmail(
              database,
              user.email,
            );
            if (!access) {
              throw new APIError("FORBIDDEN", {
                message: "ACCESS_NOT_ASSIGNED_USER",
              });
            }
            return { data: { ...user, role: access.role } };
          },
        },
      },
      account: {
        create: {
          after: async (account) => {
            const user = await database.query<{ email: string }>(
              `SELECT email FROM auth."user" WHERE id = $1 LIMIT 1`,
              [account.userId],
            );
            const email = user.rows[0]?.email;
            if (!email) {
              throw new APIError("FORBIDDEN", {
                message: "ACCESS_NOT_ASSIGNED_ACCOUNT_USER",
              });
            }
            const provider = toSoundVaultProvider(account.providerId);
            if (provider !== environment.provider) {
              throw new APIError("FORBIDDEN", {
                message: "UNSUPPORTED_AUTH_PROVIDER",
              });
            }
            try {
              await activateTeamAccessForIdentity(database, {
                userId: account.userId,
                email,
                provider,
                providerAccountId: account.accountId,
              });
            } catch (error) {
              throw accessError(error, "ACCOUNT");
            }
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            try {
              await requireActiveTeamAccess(database, session.userId);
              return;
            } catch (error) {
              const identity = await database.query<{
                email: string;
                providerId: string;
                accountId: string;
              }>(
                `SELECT u.email,
                        a."providerId" AS "providerId",
                        a."accountId" AS "accountId"
                 FROM auth."user" u
                 JOIN auth.account a ON a."userId" = u.id
                 WHERE u.id = $1
                 ORDER BY a."createdAt" ASC
                 LIMIT 1`,
                [session.userId],
              );
              const account = identity.rows[0];
              if (!account) {
                throw accessError(error, "SESSION");
              }

              const provider = toSoundVaultProvider(account.providerId);
              if (provider !== environment.provider) {
                throw new APIError("FORBIDDEN", {
                  message: "UNSUPPORTED_AUTH_PROVIDER",
                });
              }

              try {
                await activateTeamAccessForIdentity(database, {
                  userId: session.userId,
                  email: account.email,
                  provider,
                  providerAccountId: account.accountId,
                });
                await requireActiveTeamAccess(database, session.userId);
              } catch (activationError) {
                throw accessError(activationError, "SESSION");
              }
            }
          },
        },
      },
    },
  });
}
