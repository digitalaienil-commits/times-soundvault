import { hasPermission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/types/auth";
import type { DemandStatus } from "@/types/demands";

export function canSeeDemand(user: CurrentUser, status: DemandStatus): boolean {
  return (
    hasPermission(user.role, "demand.read") &&
    (user.role !== "music_producer" || status !== "draft")
  );
}

export function canManageDemand(user: CurrentUser): boolean {
  return hasPermission(user.role, "demand.manage");
}

export function canRespondToDemand(user: CurrentUser): boolean {
  return hasPermission(user.role, "demand.respond");
}

export function canSeeResponse(
  user: CurrentUser,
  responderUserId: string,
): boolean {
  return canManageDemand(user) || user.id === responderUserId;
}
