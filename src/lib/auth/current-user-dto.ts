import type { CurrentUser } from "@/types/auth";
import type { TeamAccessRecord } from "@/types/team-access";

export function createInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const fromName = parts
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  if (fromName) {
    return fromName;
  }
  const fromEmail = email.trim()[0]?.toUpperCase();
  return fromEmail && /[A-Z0-9]/.test(fromEmail) ? fromEmail : "SV";
}

export function toCurrentUser(
  identity: { id: string; name: string; email: string },
  access: TeamAccessRecord,
): CurrentUser | null {
  if (access.status !== "active" || access.authUserId !== identity.id) {
    return null;
  }
  return {
    id: identity.id,
    name: identity.name || access.displayName || identity.email,
    email: identity.email,
    initials: createInitials(identity.name, identity.email),
    role: access.role,
    accessStatus: "active",
  };
}
