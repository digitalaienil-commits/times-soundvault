import type { AccessStatus, AuthProvider, UserRole } from "./auth";

export interface TeamAccessRecord {
  id: string;
  normalizedEmail: string;
  displayName: string | null;
  role: UserRole;
  status: AccessStatus;
  authUserId: string | null;
  provider: AuthProvider | null;
  providerAccountId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  lastRoleChangedAt: Date | null;
}

export type AccessAuditAction =
  | "team_member_added"
  | "identity_activated"
  | "role_changed"
  | "access_suspended"
  | "access_reactivated"
  | "sessions_revoked"
  | "bootstrap_admin_assigned";

export interface AccessAuditEvent {
  id: string;
  actorUserId: string | null;
  targetUserId: string | null;
  targetAccessId: string;
  action: AccessAuditAction;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: Date;
}
