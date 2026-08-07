import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-8 shadow-soft sm:p-10">
        <BrandLockup />
        <p className="mt-12 font-mono text-sm font-semibold text-brand tabular-nums">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          This page is outside the vault.
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          The destination may have moved, or it may belong to a future section
          of Times SoundVault.
        </p>
        <Button asChild className="mt-8 h-11 px-4">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Return to Dashboard
          </Link>
        </Button>
      </div>
    </main>
  );
}
