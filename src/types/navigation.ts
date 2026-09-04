import type { LucideIcon } from "lucide-react";

import type { UserRole } from "@/types/auth";

export type WorkspaceRoute =
  | "/dashboard"
  | "/library"
  | "/my-uploads"
  | "/upload"
  | "/generate"
  | "/review"
  | "/copyright"
  | "/demands"
  | "/team"
  | "/admin"
  | "/admin/system"
  | "/admin/team"
  | "/admin/taxonomy"
  | "/admin/catalog"
  | "/admin/submissions"
  | "/admin/processing"
  | "/admin/media"
  | "/admin/copyright"
  | "/admin/demands"
  | "/admin/audit"
  | "/admin/retention"
  | "/admin/integrity";

export type WorkspaceRouteFamily =
  | WorkspaceRoute
  | "/upload/[batchId]"
  | "/review/[submissionId]"
  | "/submissions/[submissionId]"
  | "/library/[trackId]"
  | "/copyright/batches/[batchId]"
  | "/demands/new"
  | "/demands/[demandId]"
  | "/demands/[demandId]/edit"
  | "/demands/[demandId]/find";

export interface NavigationItem {
  href: WorkspaceRoute;
  label: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
}
