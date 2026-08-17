import type { ReactNode } from "react";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { SkipLink } from "@/components/shared/skip-link";

export async function AuthFrame({ children }: { children: ReactNode }) {
  const brand = await BrandLockup({});

  return (
    <div className="min-h-dvh bg-background">
      <SkipLink />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-28 w-full max-w-6xl items-center px-5 sm:px-8">
          {brand}
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="outline-none">
        <div className="mx-auto grid min-h-[calc(100dvh-7rem)] w-full max-w-6xl items-center px-5 py-12 sm:px-8 lg:grid-cols-[1fr_28rem] lg:gap-16 lg:py-16">
          {children}
        </div>
      </main>
    </div>
  );
}
