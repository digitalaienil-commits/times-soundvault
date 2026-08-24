import {
  ChartNoAxesCombined,
  ClipboardCheck,
  Clock3,
  LibraryBig,
  Music2,
} from "lucide-react";

import type { UserRole } from "@/types/auth";

import type { DashboardMetricValues } from "../data/dashboard-metrics";

interface DashboardMetricsProps {
  metrics: DashboardMetricValues;
  role: Exclude<UserRole, "user">;
}

function formatDuration(durationMs: number): string {
  const hours = durationMs / 3_600_000;
  if (hours >= 1) {
    return `${hours.toFixed(1).replace(/\.0$/, "")}h`;
  }
  return `${Math.round(durationMs / 60_000)}m`;
}

function MetricValue({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">&mdash;</span>
        <span className="sr-only">Not available</span>
      </>
    );
  }
  return value;
}

export function DashboardMetrics({ metrics, role }: DashboardMetricsProps) {
  const isProducer = role === "music_producer";
  const cards = [
    {
      label: "Total Tracks",
      value: metrics.totalTracks.toLocaleString("en-IN"),
      description: isProducer
        ? "Across your submissions"
        : "Across the workspace",
      icon: Music2,
      iconClassName: "bg-brand-soft text-brand",
    },
    {
      label: "Avg AI Confidence",
      value:
        metrics.averageAiConfidence === null
          ? null
          : `${Math.round(metrics.averageAiConfidence * 100)}%`,
      description: "Across analysed metadata",
      icon: ChartNoAxesCombined,
      iconClassName: "bg-success/10 text-success",
    },
    {
      label: isProducer ? "My Submissions" : "Needs Review",
      value: metrics.attentionCount.toLocaleString("en-IN"),
      description: isProducer
        ? "Your active submission records"
        : "Ready for Coordinator review",
      icon: ClipboardCheck,
      iconClassName: "bg-warning/10 text-warning",
    },
    {
      label: "Total Duration",
      value: formatDuration(metrics.totalDurationMs),
      description: "Available master audio",
      icon: Clock3,
      iconClassName: "bg-muted text-foreground",
    },
    {
      label: "Published Tracks",
      value: metrics.publishedTracks.toLocaleString("en-IN"),
      description: "Live in the Library",
      icon: LibraryBig,
      iconClassName: "bg-brand-soft text-brand",
    },
  ] as const;

  return (
    <section aria-labelledby="library-overview-title">
      <h2 id="library-overview-title" className="sr-only">
        Library overview
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              data-testid="dashboard-metric"
              className="min-h-32 rounded-xl border border-border bg-surface p-5 shadow-soft"
            >
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${card.iconClassName}`}
                >
                  <Icon className="size-5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-2xl leading-none font-semibold tracking-[-0.04em] text-foreground tabular-nums">
                    <MetricValue value={card.value} />
                  </p>
                  <h3 className="mt-2 text-sm leading-5 font-medium text-foreground">
                    {card.label}
                  </h3>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
