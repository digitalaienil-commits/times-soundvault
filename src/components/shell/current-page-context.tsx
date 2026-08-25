"use client";

import { usePathname } from "next/navigation";

const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/library": "Library",
  "/my-uploads": "Submissions",
  "/upload": "Upload",
  "/review": "Review Queue",
  "/demands": "Demand Sheet",
  "/team": "Team",
  "/admin": "Admin",
};

export function CurrentPageContext() {
  const pathname = usePathname();
  const label = pathname.startsWith("/library/")
    ? "Published Track"
    : (PAGE_LABELS[pathname] ?? "Workspace");

  return (
    <div className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
      <span className="text-muted-foreground">SoundVault</span>
      <span aria-hidden="true" className="text-border">
        /
      </span>
      <span className="truncate font-medium text-foreground">{label}</span>
    </div>
  );
}
