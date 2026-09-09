import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";
import { buildContentSecurityPolicy } from "@/lib/http/security-headers";

const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

/**
 * Paths that redirect to sign-in without a session cookie. This is an
 * optimistic check for navigation only: every protected route and sensitive
 * mutation still authorises on the server.
 */
const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/library",
  "/my-uploads",
  "/upload",
  "/submissions",
  "/review",
  "/copyright",
  "/demands",
  "/generate",
  "/team",
  "/admin",
];

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    PROTECTED_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV,
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const { pathname, search } = request.nextUrl;
  const hasLikelySession = SESSION_COOKIE_NAMES.some((name) =>
    request.cookies.has(name),
  );

  if (isProtectedPath(pathname) && !hasLikelySession) {
    const callbackUrl = sanitizeCallbackUrl(
      `${pathname}${search}`,
      "/dashboard",
    );
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", callbackUrl);
    const redirectResponse = NextResponse.redirect(signInUrl);
    redirectResponse.headers.set(
      "Content-Security-Policy",
      contentSecurityPolicy,
    );
    return redirectResponse;
  }

  if (hasLikelySession) {
    requestHeaders.set(
      "x-soundvault-callback",
      sanitizeCallbackUrl(`${pathname}${search}`, "/dashboard"),
    );
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    /*
     * Every page request except Next.js build output, image optimisation,
     * the favicon and static brand assets. API routes receive the static
     * security headers from next.config.ts instead.
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|brand/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
