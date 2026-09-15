import { ClientSecretCredential } from "@azure/identity";

/**
 * Shared Microsoft Graph access for the storage operator scripts.
 *
 * Microsoft issues a perfectly valid token to an app registration that has been
 * granted no application permissions at all. Authentication therefore looks
 * successful and every subsequent call fails with `401 General exception while
 * processing`, which names neither the cause nor the fix. The granted
 * permissions are readable from the token itself, so they are read once at
 * sign-in and used to explain the failure instead of guessing at it.
 */
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE = "https://graph.microsoft.com/.default";

export interface GraphApplication {
  token: string;
  /** Application permissions granted to the app, or null if unreadable. */
  roles: string[] | null;
  displayName: string;
  appId: string;
  tenantId: string;
}

export interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

function readClaims(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
      string,
      unknown
    >;
  } catch {
    // The token is opaque to us; the calls themselves still work.
    return null;
  }
}

export async function acquireGraphApplication(
  credentials: GraphCredentials,
): Promise<GraphApplication> {
  const token = (
    await new ClientSecretCredential(
      credentials.tenantId,
      credentials.clientId,
      credentials.clientSecret,
    ).getToken(SCOPE)
  )?.token;
  if (!token) throw new Error("Microsoft Graph token acquisition failed");

  const claims = readClaims(token);
  const roles = claims
    ? Array.isArray(claims.roles)
      ? (claims.roles as string[])
      : []
    : null;

  return {
    token,
    roles,
    displayName:
      typeof claims?.app_displayname === "string"
        ? claims.app_displayname.trim()
        : credentials.clientId,
    appId:
      typeof claims?.appid === "string" ? claims.appid : credentials.clientId,
    tenantId:
      typeof claims?.tid === "string" ? claims.tid : credentials.tenantId,
  };
}

/** Human-readable summary of what the tenant has actually granted. */
export function describeGrantedPermissions(app: GraphApplication): string {
  if (app.roles === null) return "Granted permissions could not be read.";
  if (app.roles.length === 0) return "No application permissions are granted.";
  return `Granted application permissions: ${app.roles.join(", ")}.`;
}

function consentInstructions(app: GraphApplication): string {
  return [
    `The app registration "${app.displayName}" has no Microsoft Graph application permissions.`,
    "Microsoft still issues a token in that state, so the credentials look correct and every call fails.",
    "",
    "A Microsoft 365 tenant administrator must, on this registration:",
    `  app id : ${app.appId}`,
    `  tenant : ${app.tenantId}`,
    "",
    "  1. API permissions -> Add a permission -> Microsoft Graph -> Application permissions",
    "  2. Add Sites.Selected (least privilege) or Files.ReadWrite.All (broad)",
    "  3. Grant admin consent for the tenant",
    "",
    "With Sites.Selected the administrator must additionally grant this app write",
    "access to the one site SoundVault will own. Delegated permissions do not apply:",
    "these scripts and the upload path run as the application, with no signed-in user.",
  ].join("\n");
}

export async function graph<T>(
  app: GraphApplication,
  path: string,
): Promise<T> {
  const response = await fetch(`${GRAPH}${path}`, {
    headers: { authorization: `Bearer ${app.token}` },
  });
  if (response.ok) return (await response.json()) as T;

  const body = await response.text();
  let detail = body.slice(0, 400);
  try {
    detail =
      (JSON.parse(body) as { error?: { message?: string } }).error?.message ??
      detail;
  } catch {
    // Graph does not always return JSON on failure.
  }

  // An authorization failure on an app with nothing granted has exactly one
  // cause, and Graph's own message never mentions it.
  if (
    (response.status === 401 || response.status === 403) &&
    app.roles?.length === 0
  ) {
    throw new Error(
      `Graph ${response.status} on ${path}: ${detail}\n\n${consentInstructions(app)}`,
    );
  }
  throw new Error(
    `Graph ${response.status} on ${path}: ${detail}\n${describeGrantedPermissions(app)}`,
  );
}
