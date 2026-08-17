import type { ReactNode } from "react";

import { RoleBadge } from "@/components/shared/role-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { productConfig } from "@/config/product";
import type { CurrentUser } from "@/types/auth";

import { SidebarNavigation } from "./sidebar-navigation";

interface AppSidebarProps {
  brand: ReactNode;
  user: CurrentUser;
}

export function AppSidebar({ brand, user }: AppSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
      <div className="flex h-28 items-center bg-brand-soft/35 px-5">
        {brand}
      </div>
      <Separator />
      <div className="flex-1 px-4 py-7">
        <p className="mb-3 px-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Workspace
        </p>
        <SidebarNavigation role={user.role} />
      </div>
      <div className="px-4 pb-4">
        <div className="mb-3 flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-success"
          />
          {productConfig.environmentLabel}
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand">
                {user.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {user.name}
              </p>
              <div className="mt-1">
                <RoleBadge role={user.role} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
