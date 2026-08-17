export const USER_ROLES = [
  "admin",
  "music_producer",
  "coordinator",
  "user",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type AccessStatus = "pending" | "active" | "suspended";
export type AuthProvider = "google" | "microsoft" | "local";

export const ROLE_LABELS = {
  admin: "Admin",
  music_producer: "Music Producer",
  coordinator: "Coordinator",
  user: "User",
} as const satisfies Record<UserRole, string>;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: UserRole;
  accessStatus: "active";
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function isAccessStatus(value: unknown): value is AccessStatus {
  return value === "pending" || value === "active" || value === "suspended";
}
