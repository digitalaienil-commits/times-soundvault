/**
 * Security response headers shared by the proxy and the Next.js config.
 *
 * Static headers are applied to every response from `next.config.ts` so that
 * API routes and static assets are covered too. The Content Security Policy is
 * built per request in the proxy because it carries a single-use nonce.
 */

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * Applied to every response. HSTS is deliberately excluded here and added only
 * for production, because a local HTTP origin must never be pinned to HTTPS in
 * a developer's browser.
 */
export const BASE_SECURITY_HEADERS: readonly SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "display-capture=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
];

export const STRICT_TRANSPORT_SECURITY: SecurityHeader = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload",
};

export function getStaticSecurityHeaders(
  nodeEnvironment: string | undefined,
): readonly SecurityHeader[] {
  return nodeEnvironment === "production"
    ? [...BASE_SECURITY_HEADERS, STRICT_TRANSPORT_SECURITY]
    : BASE_SECURITY_HEADERS;
}

/**
 * Builds a nonce-based policy. React needs `'unsafe-eval'` in development to
 * rebuild server stacks in the browser; production never enables it.
 *
 * `media-src` allows `blob:` because the workspace player streams private
 * previews through object URLs, and `img-src` allows `data:` for inline icons.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  nodeEnvironment: string | undefined,
): string {
  const development = nodeEnvironment === "development";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      development ? " 'unsafe-eval'" : ""
    }`,
    // A nonce in `style-src` makes browsers ignore `'unsafe-inline'`, which
    // would break the inline `style` attributes React renders for waveforms
    // and progress meters. Scripts carry the nonce; styles stay inline-capable.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ];
  if (!development) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}
