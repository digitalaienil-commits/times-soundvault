import { navigationItems } from "@/config/navigation";
import type { UserRole } from "@/types/auth";
import { isUserRole } from "@/types/auth";
import type { NavigationItem } from "@/types/navigation";

export const PERMISSIONS = [
  "workspace.access",
  "library.read",
  "audio.listen",
  "audio.download",
  "submission.create",
  "submission.readOwn",
  "submission.updateOwn",
  "submission.readAll",
  "submission.review",
  "submission.metadataReview",
  "submission.approve",
  "submission.bulkApprove",
  "submission.requestChanges",
  "submission.recommendReject",
  "submission.confirmReject",
  "submission.publish",
  "submission.unpublish",
  "demand.read",
  "demand.create",
  "demand.manage",
  "team.read",
  "team.manage",
  "providers.manage",
  "system.manage",
  "audit.read",
  "copyright.readOwn",
  "copyright.readAll",
  "copyright.prepare",
  "copyright.record",
  "copyright.resolve",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const USER_PERMISSIONS = [
  "workspace.access",
  "library.read",
  "audio.listen",
  "audio.download",
] as const satisfies readonly Permission[];

const MUSIC_PRODUCER_PERMISSIONS = [
  ...USER_PERMISSIONS,
  "submission.create",
  "submission.readOwn",
  "submission.updateOwn",
  "demand.read",
  "copyright.readOwn",
] as const satisfies readonly Permission[];

const COORDINATOR_PERMISSIONS = [
  ...USER_PERMISSIONS,
  "submission.create",
  "submission.readOwn",
  "submission.updateOwn",
  "submission.readAll",
  "submission.review",
  "submission.metadataReview",
  "submission.approve",
  "submission.bulkApprove",
  "submission.requestChanges",
  "submission.recommendReject",
  "submission.publish",
  "demand.read",
  "demand.create",
  "demand.manage",
  "copyright.readAll",
  "copyright.prepare",
  "copyright.record",
  "copyright.resolve",
] as const satisfies readonly Permission[];

const ROLE_PERMISSIONS = {
  admin: PERMISSIONS,
  music_producer: MUSIC_PRODUCER_PERMISSIONS,
  coordinator: COORDINATOR_PERMISSIONS,
  user: USER_PERMISSIONS,
} as const satisfies Record<UserRole, readonly Permission[]>;

export function getPermissionsForRole(role: unknown): readonly Permission[] {
  return isUserRole(role) ? ROLE_PERMISSIONS[role] : [];
}

export function hasPermission(role: unknown, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}

export function hasAllPermissions(
  role: unknown,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

export function hasAnyPermission(
  role: unknown,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function getNavigationForRole(role: unknown): NavigationItem[] {
  if (!isUserRole(role)) {
    return [];
  }

  return navigationItems.filter((item) =>
    item.roles.some((allowedRole) => allowedRole === role),
  );
}
