import type { AuthEnvironment } from "./environment-schema";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function canUseLocalDirectSignIn(
  environment: AuthEnvironment,
  requestOrigin: string,
  browserOrigin: string | null,
  nodeEnvironment = process.env.NODE_ENV,
): boolean {
  if (
    nodeEnvironment === "production" ||
    environment.provider !== "local" ||
    !environment.local
  ) {
    return false;
  }

  try {
    const origin = new URL(requestOrigin);
    return (
      LOCAL_HOSTNAMES.has(origin.hostname) &&
      origin.origin === environment.baseUrl &&
      browserOrigin === origin.origin &&
      environment.trustedOrigins.includes(origin.origin)
    );
  } catch {
    return false;
  }
}
