import type { NextConfig } from "next";

import { getStaticSecurityHeaders } from "./src/lib/http/security-headers";

const nextConfig: NextConfig = {
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
