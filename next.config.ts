import type { NextConfig } from "next";

import { getStaticSecurityHeaders } from "./src/lib/http/security-headers";

/**
 * Extra hostnames allowed to request dev-only assets such as `/_next/hmr`.
 *
 * Next.js blocks cross-origin dev requests by default. Reaching a dev server
 * through a tunnel or a LAN address therefore fails to load the dev client,
 * and the page never hydrates: it renders but nothing is interactive. This is
 * development-only and is ignored by `next build`.
 */
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),

  // Essentia ships a large WebAssembly runtime and is only used by the
  // server-side processing worker. Loading it through Node keeps normal page
  // compilation fast and prevents it from entering browser bundles.
  serverExternalPackages: ["essentia.js"],

  // Error responses must not advertise the framework.
  poweredByHeader: false,

  // Static security headers cover every response, including API routes and
  // static assets that the proxy deliberately skips. The per-request Content
  // Security Policy is set in `src/proxy.ts` because it carries a nonce.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...getStaticSecurityHeaders(process.env.NODE_ENV)],
      },
    ];
  },
};

export default nextConfig;
