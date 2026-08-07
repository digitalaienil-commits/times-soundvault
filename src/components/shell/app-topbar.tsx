import type { ReactNode } from "react";

import type { CurrentUser } from "@/types/auth";

import { CurrentPageContext } from "./current-page-context";
import { MobileNavigation } from "./mobile-navigation";
import { UserMenu } from "./user-menu";

interface AppTopbarProps {
  headerBrand: ReactNode;
  sheetBrand: ReactNode;
  user: CurrentUser;
}

export function AppTopbar({ headerBrand, sheetBrand, user }: AppTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-6 lg:h-18 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation brand={sheetBrand} role={user.role} />
        <div className="min-w-0 lg:hidden">{headerBrand}</div>
        <CurrentPageContext />
      </div>
      <UserMenu user={user} />
    </header>
  );
}
