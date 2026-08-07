import type { LucideIcon } from "lucide-react";

import type { UserRole } from "@/types/auth";

export type WorkspaceRoute =
  "/dashboard" | "/library" | "/generate" | "/upload" | "/admin";

export interface NavigationItem {
  href: WorkspaceRoute;
  label: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
}
