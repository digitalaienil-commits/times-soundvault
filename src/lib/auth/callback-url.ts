import { PROTECTED_ROUTES } from "./route-policy";

const BLOCKED_ENCODING = /%(?:2f|5c)/i;

export function sanitizeCallbackUrl(
  value: string | null | undefined,
  fallback: string,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    BLOCKED_ENCODING.test(value)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://soundvault.invalid");

    if (
      parsed.origin !== "https://soundvault.invalid" ||
      parsed.hash ||
      (parsed.pathname !== "/" &&
        !PROTECTED_ROUTES.includes(
          parsed.pathname as (typeof PROTECTED_ROUTES)[number],
        ))
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}
