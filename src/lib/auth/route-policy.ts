import type { UserRole } from "@/types/auth";
import type { WorkspaceRoute, WorkspaceRouteFamily } from "@/types/navigation";

import type { Permission } from "./permissions";
import { hasPermission } from "./permissions";

export const ROUTE_PERMISSIONS = {
  "/dashboard": "submission.create",
  "/library": "library.read",
  "/my-uploads": "submission.readOwn",
  "/upload": "submission.create",
  "/review": "submission.review",
  "/copyright": "copyright.readAll",
  "/demands": "demand.read",
  "/team": "team.read",
  "/admin": "system.manage",
} as const satisfies Record<WorkspaceRoute, Permission>;

export const ROUTE_FAMILY_PERMISSIONS = {
  ...ROUTE_PERMISSIONS,
  "/upload/[batchId]": "submission.create",
  "/review/[submissionId]": "submission.review",
  "/submissions/[submissionId]": "submission.readOwn",
  "/copyright/batches/[batchId]": "copyright.readAll",
} as const satisfies Record<WorkspaceRouteFamily, Permission>;

const DYNAMIC_ROUTE_FAMILIES = [
  {
    family: "/upload/[batchId]",
    pattern: /^\/upload\/([^/]+)$/,
  },
  {
    family: "/review/[submissionId]",
    pattern: /^\/review\/([^/]+)$/,
  },
  {
    family: "/submissions/[submissionId]",
    pattern: /^\/submissions\/([^/]+)$/,
  },
  {
    family: "/copyright/batches/[batchId]",
    pattern: /^\/copyright\/batches\/([^/]+)$/,
  },
] as const;

export const PROTECTED_ROUTES = Object.keys(
  ROUTE_PERMISSIONS,
) as WorkspaceRoute[];

export function isWorkspaceRoute(pathname: string): pathname is WorkspaceRoute {
  return Object.hasOwn(ROUTE_PERMISSIONS, pathname);
}

export function canAccessRoute(role: unknown, route: WorkspaceRoute): boolean {
  return hasPermission(role, ROUTE_PERMISSIONS[route]);
}

export function matchWorkspaceRoute(
  pathname: string,
): WorkspaceRouteFamily | null {
  if (isWorkspaceRoute(pathname)) {
    return pathname;
  }
  return (
    DYNAMIC_ROUTE_FAMILIES.find(({ pattern }) => pattern.test(pathname))
      ?.family ?? null
  );
}

export function canAccessRouteFamily(
  role: unknown,
  route: WorkspaceRouteFamily,
): boolean {
  if (route === "/submissions/[submissionId]") {
    return (
      hasPermission(role, "submission.readOwn") ||
      hasPermission(role, "submission.readAll")
    );
  }
  return hasPermission(role, ROUTE_FAMILY_PERMISSIONS[route]);
}

export function getDefaultRouteForRole(role: UserRole): WorkspaceRoute {
  return role === "user" ? "/library" : "/dashboard";
}
