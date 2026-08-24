import type { LucideIcon } from "lucide-react";

import type { UserRole } from "@/types/auth";

export type WorkspaceRoute =
  | "/dashboard"
  | "/library"
  | "/my-uploads"
  | "/upload"
  | "/review"
  | "/demands"
  | "/team"
  | "/admin";

export type WorkspaceRouteFamily =
  WorkspaceRoute | "/upload/[batchId]" | "/submissions/[submissionId]";

export interface NavigationItem {
  href: WorkspaceRoute;
  label: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
}
