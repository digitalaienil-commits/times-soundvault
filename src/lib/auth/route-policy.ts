import type { UserRole } from "@/types/auth";
import type { WorkspaceRoute } from "@/types/navigation";

import type { Permission } from "./permissions";
import { hasPermission } from "./permissions";

export const ROUTE_PERMISSIONS = {
  "/dashboard": "submission.create",
  "/library": "library.read",
  "/my-uploads": "submission.readOwn",
  "/upload": "submission.create",
  "/review": "submission.review",
  "/demands": "demand.read",
  "/team": "team.read",
  "/admin": "system.manage",
} as const satisfies Record<WorkspaceRoute, Permission>;

export const PROTECTED_ROUTES = Object.keys(
  ROUTE_PERMISSIONS,
) as WorkspaceRoute[];

export function isWorkspaceRoute(pathname: string): pathname is WorkspaceRoute {
  return Object.hasOwn(ROUTE_PERMISSIONS, pathname);
}

export function canAccessRoute(role: unknown, route: WorkspaceRoute): boolean {
  return hasPermission(role, ROUTE_PERMISSIONS[route]);
}

export function getDefaultRouteForRole(role: UserRole): WorkspaceRoute {
  return role === "user" ? "/library" : "/dashboard";
}
