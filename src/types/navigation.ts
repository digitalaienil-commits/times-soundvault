import type { LucideIcon } from "lucide-react";

import type { UserRole } from "@/types/auth";

export type WorkspaceRoute =
  | "/dashboard"
  | "/library"
  | "/my-uploads"
  | "/upload"
  | "/review"
  | "/copyright"
  | "/demands"
  | "/team"
  | "/admin";

export type WorkspaceRouteFamily =
  | WorkspaceRoute
  | "/upload/[batchId]"
  | "/review/[submissionId]"
  | "/submissions/[submissionId]"
  | "/library/[trackId]"
  | "/copyright/batches/[batchId]";

export interface NavigationItem {
  href: WorkspaceRoute;
  label: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
}
