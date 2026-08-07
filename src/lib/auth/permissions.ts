import { navigationItems, workspaceRoutes } from "@/config/navigation";
import type { UserRole } from "@/types/auth";
import type { NavigationItem, WorkspaceRoute } from "@/types/navigation";

export function getNavigationForRole(role: UserRole): NavigationItem[] {
  return navigationItems.filter((item) =>
    item.roles.some((allowedRole) => allowedRole === role),
  );
}

export function canAccessRoute(role: UserRole, route: WorkspaceRoute): boolean {
  const item = navigationItems.find((candidate) => candidate.href === route);
  return item?.roles.some((allowedRole) => allowedRole === role) ?? false;
}

export function isWorkspaceRoute(pathname: string): pathname is WorkspaceRoute {
  return workspaceRoutes.includes(pathname as WorkspaceRoute);
}
