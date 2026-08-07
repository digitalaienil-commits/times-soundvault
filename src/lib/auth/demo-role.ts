import type { UserRole } from "@/types/auth";

export function resolveDemoRole(
  value: string | undefined,
  environment: string | undefined,
): UserRole {
  if (value === "admin" || value === "reviewer") {
    return value;
  }

  if (value === undefined || value.trim() === "") {
    return environment === "development" ? "admin" : "reviewer";
  }

  return "reviewer";
}
