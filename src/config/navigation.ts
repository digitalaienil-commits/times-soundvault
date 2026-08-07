import {
  LayoutDashboard,
  LibraryBig,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import type { NavigationItem, WorkspaceRoute } from "@/types/navigation";

export const navigationItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "reviewer"],
  },
  {
    href: "/library",
    label: "Library",
    icon: LibraryBig,
    roles: ["admin", "reviewer"],
  },
  {
    href: "/generate",
    label: "Generate",
    icon: Sparkles,
    roles: ["admin", "reviewer"],
  },
  {
    href: "/upload",
    label: "Upload",
    icon: UploadCloud,
    roles: ["admin"],
  },
  {
    href: "/admin",
    label: "Admin",
    icon: ShieldCheck,
    roles: ["admin"],
  },
] as const satisfies readonly NavigationItem[];

export const workspaceRoutes = navigationItems.map(
  (item) => item.href,
) as WorkspaceRoute[];
