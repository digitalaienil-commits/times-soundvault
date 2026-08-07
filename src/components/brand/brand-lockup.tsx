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
  const assets = ["mirchi-logo.svg", "mirchi-logo.png"];

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
      className={cn("flex min-w-0 items-center gap-2.5", className)}
      data-testid="brand-lockup"
    >
      {approvedLogo ? (
        <Image
          src={approvedLogo}
          alt="Mirchi logo"
          width={96}
          height={36}
          className={cn(
            "object-contain object-left",
            compact ? "h-7 w-14" : "h-8 w-20",
          )}
          unoptimized
        />
      ) : (
        <span className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] text-foreground">
          <span className="flex size-8 items-center justify-center rounded-md bg-brand text-brand-foreground">
            <AudioLines aria-hidden="true" className="size-4" />
          </span>
          <span className={cn(compact && "sr-only")}>
            {productConfig.brandName}
          </span>
        </span>
      )}
      <span aria-hidden="true" className="h-7 w-px shrink-0 bg-border" />
      <span
        className={cn(
          "truncate font-semibold tracking-[-0.025em] text-foreground",
          "text-sm",
        )}
      >
        {productConfig.name}
      </span>
    </div>
  );
}
