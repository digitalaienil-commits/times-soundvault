"use client";

import { ChevronDown, CircleUserRound } from "lucide-react";

import { RoleBadge } from "@/components/shared/role-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CurrentUser } from "@/types/auth";

interface UserMenuProps {
  user: CurrentUser;
}

export function UserMenu({ user }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 gap-2 rounded-lg px-2 hover:bg-muted"
          aria-label={`Open account menu for ${user.name}`}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand">
              {user.initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 text-left md:block">
            <span className="block max-w-36 truncate text-sm font-semibold text-foreground">
              {user.name}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="hidden size-4 text-muted-foreground sm:block"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <DropdownMenuLabel className="p-3 font-normal">
          <span className="flex items-start gap-3">
            <CircleUserRound
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {user.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-3 p-3">
          <span className="text-xs text-muted-foreground">Demo session</span>
          <RoleBadge role={user.role} />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
