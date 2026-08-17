"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { getNavigationForRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/utilities/cn";
import type { UserRole } from "@/types/auth";

interface SidebarNavigationProps {
  role: UserRole;
  onNavigate?: () => void;
}

export function SidebarNavigation({
  role,
  onNavigate,
}: SidebarNavigationProps) {
  const pathname = usePathname();
  const items = getNavigationForRole(role);

  return (
    <nav aria-label="Primary navigation" data-testid="primary-navigation">
      <ul className="space-y-1.5">
        {items.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <li key={`${item.href}:${item.label}`}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-offset-1",
                  isActive &&
                    "bg-brand-soft font-semibold text-foreground before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-brand",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-[1.125rem] text-muted-foreground transition-colors duration-150 group-hover:text-foreground",
                    isActive && "text-brand",
                  )}
                  strokeWidth={1.8}
                />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
