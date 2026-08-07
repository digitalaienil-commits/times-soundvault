import { ArrowRight, Sparkles, UploadCloud } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types/auth";

import { foundationCapabilities } from "../data/capabilities";

interface FoundationDashboardProps {
  role: UserRole;
}

export function FoundationDashboard({ role }: FoundationDashboardProps) {
  return (
    <div className="mt-8 space-y-8">
      <section
        aria-labelledby="welcome-title"
        className="relative overflow-hidden rounded-xl border border-brand/15 bg-brand-soft px-6 py-8 sm:px-8 sm:py-10 lg:px-10"
      >
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 h-full w-1 bg-brand"
        />
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">
            Your audio workspace
          </p>
          <h2
            id="welcome-title"
            className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl"
          >
            Find the right sound, faster.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-foreground">
            Times SoundVault brings the team&apos;s music, background scores and
            sound effects into one intelligent workspace.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 px-4">
              <Link href="/library">
                Browse Library
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 border-brand/20 bg-surface px-4 hover:bg-surface"
            >
              <Link href="/generate">
                <Sparkles aria-hidden="true" data-icon="inline-start" />
                Generate Audio
              </Link>
            </Button>
            {role === "admin" ? (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-11 border-brand/20 bg-surface px-4 hover:bg-surface"
              >
                <Link href="/upload">
                  <UploadCloud aria-hidden="true" data-icon="inline-start" />
                  Upload Tracks
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="capabilities-title">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Foundation preview
            </p>
            <h2
              id="capabilities-title"
              className="mt-2 text-xl font-semibold tracking-[-0.025em] text-foreground"
            >
              Designed around the complete audio journey
            </h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {foundationCapabilities.map((capability, index) => {
            const Icon = capability.icon;

            return (
              <article
                key={capability.title}
                className="group min-h-56 rounded-xl border border-border bg-surface p-6 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-brand/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                    <Icon
                      aria-hidden="true"
                      className="size-[1.125rem]"
                      strokeWidth={1.75}
                    />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-8 text-base font-semibold tracking-[-0.015em] text-foreground">
                  {capability.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {capability.description}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
