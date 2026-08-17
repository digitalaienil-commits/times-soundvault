"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { UserRole } from "@/types/auth";

import { SidebarNavigation } from "./sidebar-navigation";

interface MobileNavigationProps {
  brand: ReactNode;
  role: UserRole;
}

export function MobileNavigation({ brand, role }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11 bg-surface lg:hidden"
          aria-label="Open navigation"
        >
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="gap-0 border-sidebar-border bg-sidebar p-0 data-[side=left]:w-[min(20rem,88vw)]"
      >
        <SheetHeader className="border-b border-border bg-brand-soft/35 px-5 py-6 text-left">
          <div className="pr-10">{brand}</div>
          <SheetTitle className="sr-only">Primary navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate through Times SoundVault.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 py-6">
          <p className="mb-3 px-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Workspace
          </p>
          <SidebarNavigation role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
