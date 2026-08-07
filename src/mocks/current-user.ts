import type { CurrentUser, UserRole } from "@/types/auth";

const usersByRole: Record<UserRole, CurrentUser> = {
  admin: {
    id: "demo-admin",
    name: "Aarav Mehta",
    email: "aarav.mehta@times.example",
    initials: "AM",
    role: "admin",
  },
  reviewer: {
    id: "demo-reviewer",
    name: "Riya Kapoor",
    email: "riya.kapoor@times.example",
    initials: "RK",
    role: "reviewer",
  },
};

export function getMockUser(role: UserRole): CurrentUser {
  return usersByRole[role];
}
