import { access } from "node:fs/promises";
import path from "node:path";

import { AudioLines } from "lucide-react";
import Image from "next/image";

import { productConfig } from "@/config/product";
import { cn } from "@/lib/utilities/cn";

interface BrandLockupProps {
  compact?: boolean;
  className?: string;
}

async function findApprovedLogo(): Promise<string | null> {
  const assets = ["times-group-logo.png"];

  for (const asset of assets) {
    try {
      await access(path.join(process.cwd(), "public", "brand", asset));
      return `/brand/${asset}`;
    } catch {
      // Continue to the next approved filename.
    }
  }

  return null;
}

export async function BrandLockup({
  compact = false,
  className,
}: BrandLockupProps) {
  const approvedLogo = await findApprovedLogo();

  return (
    <div
      className={cn(
        "flex min-w-0",
        compact ? "items-center" : "flex-col items-start gap-2.5",
        className,
      )}
      data-testid="brand-lockup"
    >
      {approvedLogo ? (
        <Image
          src={approvedLogo}
          alt="The Times Group"
          width={349}
          height={238}
          className={cn(
            "h-auto shrink-0 object-contain object-left",
            compact ? "w-[3.75rem]" : "w-28",
          )}
          unoptimized
        />
      ) : (
        <span className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] text-foreground">
          <span className="flex size-8 items-center justify-center rounded-md bg-brand text-brand-foreground">
            <AudioLines aria-hidden="true" className="size-4" />
          </span>
          <span>{productConfig.brandName}</span>
        </span>
      )}
      {compact ? (
        <span className="sr-only">{productConfig.name}</span>
      ) : (
        <span className="flex items-center gap-2.5 text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">
          <span aria-hidden="true" className="h-px w-6 shrink-0 bg-brand" />
          <span>{productConfig.name}</span>
        </span>
      )}
    </div>
  );
}
