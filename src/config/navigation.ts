import {
  ClipboardCheck,
  FileAudio,
  ListMusic,
  LayoutDashboard,
  LibraryBig,
  ShieldCheck,
  UsersRound,
  UploadCloud,
} from "lucide-react";

import type { NavigationItem, WorkspaceRoute } from "@/types/navigation";

export const navigationItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "music_producer", "coordinator"],
  },
  {
    href: "/library",
    label: "Library",
    icon: LibraryBig,
    roles: ["admin", "music_producer", "coordinator", "user"],
  },
  {
    href: "/my-uploads",
    label: "My Uploads",
    icon: FileAudio,
    roles: ["music_producer"],
  },
  {
    href: "/my-uploads",
    label: "Submissions",
    icon: FileAudio,
    roles: ["admin"],
  },
  {
    href: "/review",
    label: "Review Queue",
    icon: ClipboardCheck,
    roles: ["admin", "coordinator"],
  },
  {
    href: "/upload",
    label: "Upload",
    icon: UploadCloud,
    roles: ["admin", "music_producer", "coordinator"],
  },
  {
    href: "/demands",
    label: "Demand Sheet",
    icon: ListMusic,
    roles: ["admin", "music_producer", "coordinator"],
  },
  {
    href: "/team",
    label: "Team",
    icon: UsersRound,
    roles: ["admin"],
  },
  {
    href: "/admin",
    label: "Admin",
    icon: ShieldCheck,
    roles: ["admin"],
  },
] as const satisfies readonly NavigationItem[];

export const workspaceRoutes = [
  "/dashboard",
  "/library",
  "/my-uploads",
  "/upload",
  "/review",
  "/demands",
  "/team",
  "/admin",
] as const satisfies readonly WorkspaceRoute[];
