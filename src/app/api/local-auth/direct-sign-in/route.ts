import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";
import { getAuthEnvironment } from "@/lib/auth/environment";
import type { LocalIdentityConfig } from "@/lib/auth/environment-schema";
import { canUseLocalDirectSignIn } from "@/lib/auth/local-direct-sign-in";
import { getDefaultRouteForRole } from "@/lib/auth/route-policy";
import { isUserRole, type UserRole } from "@/types/auth";

export const dynamic = "force-dynamic";

function signInUrl(baseUrl: string, callbackUrl: string): URL {
  const url = new URL("/sign-in", baseUrl);
  url.searchParams.set("callbackUrl", callbackUrl);
  url.searchParams.set("localError", "1");
  return url;
}

function getLocalIdentity(
  local: NonNullable<ReturnType<typeof getAuthEnvironment>["local"]>,
  role: UserRole,
): LocalIdentityConfig {
  const identities = {
    admin: local.admin,
    music_producer: local.musicProducer,
    coordinator: local.coordinator,
    user: local.user,
  } satisfies Record<UserRole, LocalIdentityConfig>;
  return identities[role];
}

export async function POST(request: Request) {
  const environment = getAuthEnvironment();
  const requestOrigin = new URL(request.url).origin;

  if (
    !canUseLocalDirectSignIn(
      environment,
      requestOrigin,
      request.headers.get("origin"),
    )
  ) {
    return new Response("Not found", { status: 404 });
  }

  const local = environment.local;
  if (!local) {
    return new Response("Not found", { status: 404 });
  }

  const form = await request.formData();
  const requestedRole = form.get("role");
  if (!isUserRole(requestedRole)) {
    return new Response("Invalid local access role", { status: 400 });
  }
  const identity = getLocalIdentity(local, requestedRole);
  const callbackUrl = sanitizeCallbackUrl(
    String(form.get("callbackUrl") ?? ""),
    getDefaultRouteForRole(requestedRole),
  );
  const authResponse = await auth.api.signInEmail({
    body: {
      email: identity.email,
      password: identity.password,
      callbackURL: callbackUrl,
    },
    headers: request.headers,
    asResponse: true,
  });

  if (!authResponse.ok) {
    return NextResponse.redirect(
      signInUrl(environment.baseUrl, callbackUrl),
      303,
    );
  }

  const response = NextResponse.redirect(
    new URL(callbackUrl, environment.baseUrl),
    303,
  );
  for (const cookie of authResponse.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
