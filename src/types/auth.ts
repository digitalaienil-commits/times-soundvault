export type UserRole = "admin" | "reviewer";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: UserRole;
}
