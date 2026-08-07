"use client";

import { usePathname } from "next/navigation";

import { navigationItems } from "@/config/navigation";

export function CurrentPageContext() {
  const pathname = usePathname();
  const item = navigationItems.find((candidate) => candidate.href === pathname);

  return (
    <div className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
      <span className="text-muted-foreground">SoundVault</span>
      <span aria-hidden="true" className="text-border">
        /
      </span>
      <span className="truncate font-medium text-foreground">
        {item?.label ?? "Workspace"}
      </span>
    </div>
  );
}
