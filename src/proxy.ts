import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";

const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

export function proxy(request: NextRequest) {
  const hasLikelySession = SESSION_COOKIE_NAMES.some((name) =>
    request.cookies.has(name),
  );
  if (hasLikelySession) {
    return NextResponse.next();
  }

  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const callbackUrl = sanitizeCallbackUrl(requestedPath, "/dashboard");
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/library/:path*",
    "/my-uploads/:path*",
    "/upload/:path*",
    "/review/:path*",
    "/demands/:path*",
    "/team/:path*",
    "/admin/:path*",
  ],
};
