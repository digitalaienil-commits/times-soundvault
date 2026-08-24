import {
  ArrowRight,
  ClipboardCheck,
  LibraryBig,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types/auth";

import { getDashboardMetrics } from "../data/dashboard-metrics";
import { DashboardMetrics } from "./dashboard-metrics";

const ROLE_WELCOME: Record<Exclude<UserRole, "user">, string> = {
  admin: "Control the music workflow from intake to publication.",
  music_producer: "Upload, improve and track every music submission.",
  coordinator:
    "Resolve metadata and rights exceptions, then publish with confidence.",
};

const QUICK_ACTIONS = {
  admin: [
    { href: "/team", label: "Manage Team", icon: UsersRound },
    { href: "/review", label: "Open Review Queue", icon: ClipboardCheck },
    { href: "/upload", label: "Upload", icon: UploadCloud },
  ],
  music_producer: [
    { href: "/my-uploads", label: "My Uploads", icon: ArrowRight },
    { href: "/upload", label: "Upload", icon: UploadCloud },
    { href: "/library", label: "Browse Library", icon: LibraryBig },
  ],
  coordinator: [
    { href: "/review", label: "Open Review Queue", icon: ClipboardCheck },
    { href: "/upload", label: "Upload", icon: UploadCloud },
    { href: "/library", label: "Browse Library", icon: LibraryBig },
  ],
} as const;

export async function FoundationDashboard({
  role,
  userId,
}: {
  role: UserRole;
  userId: string;
}) {
  if (role === "user") return null;
  const metrics = await getDashboardMetrics(
    role === "music_producer" ? userId : null,
  );

  return (
    <div className="mt-8 space-y-6">
      <DashboardMetrics metrics={metrics} role={role} />

      <section
        aria-labelledby="welcome-title"
        className="overflow-hidden rounded-xl border border-brand/15 bg-brand-soft"
      >
        <div className="border-l-4 border-brand px-6 py-8 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">
            Your workspace
          </p>
          <h2
            id="welcome-title"
            className="mt-3 max-w-3xl text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl"
          >
            {ROLE_WELCOME[role]}
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Work from the same governed catalog across submissions, review and
            the published Library. Each destination reflects real records and
            your assigned access.
          </p>
        </div>
      </section>
      <section
        aria-labelledby="quick-actions-title"
        className="rounded-xl border border-border bg-surface p-6 sm:p-7"
      >
        <h2
          id="quick-actions-title"
          className="text-lg font-semibold tracking-[-0.02em]"
        >
          Quick actions
        </h2>
        <div className="mt-5 flex flex-wrap gap-3">
          {QUICK_ACTIONS[role].map((action, index) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.href}
                asChild
                variant={index === 0 ? "default" : "outline"}
                size="lg"
                className="h-11"
              >
                <Link href={action.href}>
                  <Icon aria-hidden="true" data-icon="inline-start" />
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
