import type { ReactNode } from "react";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { SkipLink } from "@/components/shared/skip-link";
import type { CurrentUser } from "@/types/auth";

import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { PlayerProvider } from "./player-provider";

interface AppShellProps {
  children: ReactNode;
  user: CurrentUser;
}

export async function AppShell({ children, user }: AppShellProps) {
  const [desktopBrand, headerBrand, sheetBrand] = await Promise.all([
    BrandLockup({}),
    BrandLockup({ compact: true }),
    BrandLockup({}),
  ]);

  return (
    <PlayerProvider>
      <div className="min-h-dvh bg-background pb-44 sm:pb-32">
        <SkipLink />
        <AppSidebar brand={desktopBrand} user={user} />
        <div className="min-h-dvh lg:pl-64">
          <AppTopbar
            headerBrand={headerBrand}
            sheetBrand={sheetBrand}
            user={user}
          />
          <main id="main-content" tabIndex={-1} className="outline-none">
            <div className="mx-auto w-full max-w-[100rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
              {children}
            </div>
          </main>
        </div>
      </div>
    </PlayerProvider>
  );
}
