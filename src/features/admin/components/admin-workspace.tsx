import Link from "next/link";
import {
  Activity,
  Archive,
  AudioWaveform,
  ClipboardCheck,
  Database,
  FileSearch,
  Gauge,
  History,
  LibraryBig,
  ListMusic,
  RefreshCcw,
  Search,
  ShieldCheck,
  Tags,
  UsersRound,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TAXONOMY_CATEGORIES } from "@/types/domain/metadata";
import type { AdminHealthItem } from "@/lib/admin/diagnostics";
import type {
  AdminMetric,
  AdminOperationalRow,
  AdminSectionKey,
} from "@/lib/admin/service";
import type { AdminMaintenanceJob } from "@/lib/admin/maintenance";
import type { AdminTaxonomyTerm } from "@/lib/admin/taxonomy";
import type { RetentionPreview } from "@/lib/admin/retention";

import {
  createTaxonomyTermAction,
  queueMaintenanceJobAction,
  reclaimExpiredJobsAction,
  setTaxonomyTermStateAction,
} from "../actions/admin-actions";

const sections = [
  {
    key: "overview",
    href: "/admin",
    title: "Overview",
    description: "Operational control center",
    icon: Gauge,
  },
  {
    key: "system",
    href: "/admin/system",
    title: "System",
    description: "Health and configuration",
    icon: Activity,
  },
  {
    key: "team",
    href: "/admin/team",
    title: "Team",
    description: "Role and access governance",
    icon: UsersRound,
  },
  {
    key: "taxonomy",
    href: "/admin/taxonomy",
    title: "Taxonomy",
    description: "Controlled metadata terms",
    icon: Tags,
  },
  {
    key: "catalog",
    href: "/admin/catalog",
    title: "Catalog",
    description: "Published library maintenance",
    icon: LibraryBig,
  },
  {
    key: "submissions",
    href: "/admin/submissions",
    title: "Submissions",
    description: "Workflow supervision",
    icon: ClipboardCheck,
  },
  {
    key: "processing",
    href: "/admin/processing",
    title: "Processing",
    description: "Technical and AI queues",
    icon: Database,
  },
  {
    key: "media",
    href: "/admin/media",
    title: "Media",
    description: "Previews and packages",
    icon: AudioWaveform,
  },
  {
    key: "copyright",
    href: "/admin/copyright",
    title: "Copyright",
    description: "Manual YouTube observations",
    icon: ShieldCheck,
  },
  {
    key: "demands",
    href: "/admin/demands",
    title: "Demands",
    description: "Internal supply planning",
    icon: ListMusic,
  },
  {
    key: "audit",
    href: "/admin/audit",
    title: "Audit",
    description: "Append-only admin events",
    icon: History,
  },
  {
    key: "retention",
    href: "/admin/retention",
    title: "Retention",
    description: "Derived artifact cleanup",
    icon: Archive,
  },
  {
    key: "integrity",
    href: "/admin/integrity",
    title: "Integrity",
    description: "Governance findings",
    icon: FileSearch,
  },
] as const satisfies readonly {
  key: AdminSectionKey;
  href: string;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
}[];

const sectionCopy: Record<
  AdminSectionKey,
  { title: string; description: string }
> = {
  overview: {
    title: "Admin Operations",
    description:
      "Control the systems already built without bypassing workflow, permissions, media safety, or audit history.",
  },
  system: {
    title: "System Health",
    description:
      "Run operational checks for database, storage, search, workers, AI analysis, OneDrive, media, and copyright configuration.",
  },
  team: {
    title: "Team Governance",
    description:
      "Review people and roles from the existing Team page. Admin mutations preserve last-admin protection and revoke sessions.",
  },
  taxonomy: {
    title: "Taxonomy Administration",
    description:
      "Create and deactivate controlled metadata terms. Historical assignments are preserved when a term is removed from new selection.",
  },
  catalog: {
    title: "Catalog Governance",
    description:
      "Inspect published library records, search index health, and maintenance needs without arbitrary metadata edits.",
  },
  submissions: {
    title: "Submission Operations",
    description:
      "Inspect workflow state and direct admins to valid submission actions; no force approve, publish, reject, or copyright-clear shortcut exists.",
  },
  processing: {
    title: "Processing Operations",
    description:
      "Inspect technical processing and AI jobs, reclaim expired leases, and queue bounded maintenance.",
  },
  media: {
    title: "Media Operations",
    description:
      "Track derived previews and download packages. Source Masters and Stems stay protected.",
  },
  copyright: {
    title: "Copyright Operations",
    description:
      "Review manual YouTube observations using no-claim-observed language and no CMS connectivity assumptions.",
  },
  demands: {
    title: "Demand Sheet Operations",
    description:
      "Inspect internal supply planning while preserving Section 11 state, ownership, and published-catalog search reuse.",
  },
  audit: {
    title: "Audit Log",
    description:
      "Read append-only admin events with bounded pagination and safe metadata summaries.",
  },
  retention: {
    title: "Retention and Cleanup",
    description:
      "Dry-run and queue derived-artifact cleanup while respecting Microsoft 365 retention boundaries.",
  },
  integrity: {
    title: "Integrity Findings",
    description:
      "Review open governance findings and queue catalog integrity scans for durable follow-up.",
  },
};

function ResultBanner({ notice, error }: { notice?: string; error?: string }) {
  return (
    <div aria-live="polite" className="mt-6">
      {notice ? (
        <p className="rounded-lg border border-success/20 bg-success/5 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AdminSectionNav({ active }: { active: AdminSectionKey }) {
  return (
    <nav aria-label="Admin sections" className="mt-8">
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = section.key === active;
          return (
            <li key={section.key}>
              <Link
                href={section.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-24 items-start gap-3 rounded-lg border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  isActive
                    ? "border-brand bg-brand-soft text-foreground"
                    : "border-border bg-surface hover:bg-muted"
                }`}
              >
                <Icon
                  aria-hidden="true"
                  className={
                    isActive
                      ? "mt-0.5 size-5 text-brand"
                      : "mt-0.5 size-5 text-muted-foreground"
                  }
                  strokeWidth={1.8}
                />
                <span>
                  <span className="block text-sm font-semibold">
                    {section.title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {section.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MetricsGrid({ metrics }: { metrics: AdminMetric[] }) {
  return (
    <section aria-labelledby="admin-metrics-title" className="mt-8">
      <h2 id="admin-metrics-title" className="sr-only">
        Admin metrics
      </h2>
      <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <dt className="text-sm font-medium text-muted-foreground">
              {metric.label}
            </dt>
            <dd className="mt-3 text-3xl font-semibold tracking-[-0.02em]">
              {metric.value}
            </dd>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {metric.detail}
            </p>
            {metric.href ? (
              <Button asChild variant="link" className="mt-2 h-auto px-0">
                <Link href={metric.href}>Open area</Link>
              </Button>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

function statusClasses(status: string) {
  if (
    status.includes("healthy") ||
    status.includes("succeeded") ||
    status.includes("active")
  ) {
    return "border-success/25 bg-success/5 text-success";
  }
  if (
    status.includes("degraded") ||
    status.includes("failed") ||
    status.includes("high")
  ) {
    return "border-destructive/20 bg-destructive/5 text-destructive";
  }
  if (
    status.includes("warning") ||
    status.includes("queued") ||
    status.includes("running")
  ) {
    return "border-warning/25 bg-warning/5 text-warning";
  }
  return "border-border bg-muted text-muted-foreground";
}

function HealthList({ items }: { items: AdminHealthItem[] }) {
  return (
    <section
      aria-labelledby="health-title"
      className="mt-8 rounded-lg border border-border bg-surface"
    >
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="health-title" className="text-lg font-semibold">
            Health checks
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Checks run on demand and never expose secret values.
          </p>
        </div>
        <form action={queueMaintenanceJobAction}>
          <input type="hidden" name="returnTo" value="/admin/system" />
          <input type="hidden" name="jobType" value="system_health_check" />
          <input type="hidden" name="subjectType" value="system" />
          <input type="hidden" name="dryRun" value="true" />
          <input
            type="hidden"
            name="requestSummary"
            value="Run system health checks from Admin UI"
          />
          <Button type="submit" variant="outline">
            <RefreshCcw aria-hidden="true" data-icon="inline-start" />
            Run check
          </Button>
        </form>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li
            key={item.key}
            className="grid gap-3 p-5 md:grid-cols-[14rem_1fr_auto] md:items-start"
          >
            <p className="font-medium">{item.label}</p>
            <div>
              <p className="text-sm font-medium">{item.summary}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {item.detail}
              </p>
            </div>
            <Badge variant="outline" className={statusClasses(item.status)}>
              {item.status}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RowList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: AdminOperationalRow[];
  empty: string;
}) {
  return (
    <section
      aria-labelledby={`${title}-title`}
      className="mt-8 rounded-lg border border-border bg-surface"
    >
      <div className="border-b border-border p-5">
        <h2 id={`${title}-title`} className="text-lg font-semibold">
          {title}
        </h2>
      </div>
      {rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto]">
              <div>
                {row.href ? (
                  <Link
                    href={row.href}
                    className="font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    {row.title}
                  </Link>
                ) : (
                  <p className="font-semibold text-foreground">{row.title}</p>
                )}
                <p className="mt-1 text-sm leading-6 break-words text-muted-foreground">
                  {row.detail}
                </p>
              </div>
              <Badge variant="outline" className={statusClasses(row.status)}>
                {row.status}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function JobList({ jobs }: { jobs: AdminMaintenanceJob[] }) {
  return (
    <section
      aria-labelledby="jobs-title"
      className="mt-8 rounded-lg border border-border bg-surface"
    >
      <div className="border-b border-border p-5">
        <h2 id="jobs-title" className="text-lg font-semibold">
          Maintenance jobs
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Durable jobs are bounded, audited, and picked up by admin workers.
        </p>
      </div>
      {jobs.length ? (
        <ul className="divide-y divide-border">
          {jobs.slice(0, 12).map((job) => (
            <li key={job.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto]">
              <div>
                <p className="font-semibold">
                  {job.jobType.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {job.requestSummary}
                </p>
                {job.resultSummary || job.lastErrorMessage ? (
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {job.resultSummary ?? job.lastErrorMessage}
                  </p>
                ) : null}
              </div>
              <Badge variant="outline" className={statusClasses(job.status)}>
                {job.status}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">
          No maintenance jobs have been queued yet.
        </p>
      )}
    </section>
  );
}

function TaxonomyPanel({
  terms,
  filters,
}: {
  terms: AdminTaxonomyTerm[];
  filters: { search?: string; category?: string };
}) {
  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[24rem_1fr]">
      <section
        aria-labelledby="taxonomy-create-title"
        className="rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="taxonomy-create-title" className="text-lg font-semibold">
          Add term
        </h2>
        <form action={createTaxonomyTermAction} className="mt-5 space-y-4">
          <div className="space-y-2">
            <label htmlFor="taxonomy-category" className="text-sm font-medium">
              Category
            </label>
            <select
              id="taxonomy-category"
              name="category"
              className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm"
            >
              {TAXONOMY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="taxonomy-label" className="text-sm font-medium">
              Label
            </label>
            <Input id="taxonomy-label" name="label" required maxLength={120} />
          </div>
          <div className="space-y-2">
            <label htmlFor="taxonomy-slug" className="text-sm font-medium">
              Slug
            </label>
            <Input
              id="taxonomy-slug"
              name="slug"
              maxLength={120}
              placeholder="Auto from label"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="taxonomy-sort" className="text-sm font-medium">
              Sort order
            </label>
            <Input
              id="taxonomy-sort"
              name="sortOrder"
              type="number"
              min="0"
              defaultValue="0"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="taxonomy-description"
              className="text-sm font-medium"
            >
              Description
            </label>
            <textarea
              id="taxonomy-description"
              name="description"
              rows={4}
              maxLength={1000}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            />
          </div>
          <Button type="submit">Create term</Button>
        </form>
      </section>

      <section
        aria-labelledby="taxonomy-list-title"
        className="rounded-lg border border-border bg-surface"
      >
        <div className="border-b border-border p-5">
          <h2 id="taxonomy-list-title" className="text-lg font-semibold">
            Terms
          </h2>
          <form
            className="mt-4 grid gap-3 md:grid-cols-[1fr_12rem_auto]"
            action="/admin/taxonomy"
          >
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute top-3.5 left-3 size-4 text-muted-foreground"
              />
              <Input
                name="search"
                defaultValue={filters.search}
                placeholder="Search term or slug"
                className="pl-9"
                aria-label="Search taxonomy"
              />
            </div>
            <select
              name="category"
              defaultValue={filters.category ?? ""}
              aria-label="Filter taxonomy category"
              className="h-11 rounded-lg border border-input bg-surface px-3 text-sm"
            >
              <option value="">All categories</option>
              {TAXONOMY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>
        </div>
        {terms.length ? (
          <ul className="divide-y divide-border">
            {terms.map((term) => (
              <li
                key={term.id}
                className="grid gap-4 p-5 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-semibold">{term.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {term.category.replaceAll("_", " ")} · {term.slug} ·{" "}
                    {term.usageCount} historical assignments · {term.aliasCount}{" "}
                    aliases
                  </p>
                  {term.description ? (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {term.description}
                    </p>
                  ) : null}
                </div>
                <form
                  action={setTaxonomyTermStateAction}
                  className="flex items-center gap-3"
                >
                  <input type="hidden" name="termId" value={term.id} />
                  <input
                    type="hidden"
                    name="operation"
                    value={term.isActive ? "deactivate" : "reactivate"}
                  />
                  <Badge
                    variant="outline"
                    className={
                      term.isActive
                        ? statusClasses("active")
                        : statusClasses("disabled")
                    }
                  >
                    {term.isActive ? "active" : "inactive"}
                  </Badge>
                  <Button
                    type="submit"
                    variant={term.isActive ? "destructive" : "outline"}
                    size="sm"
                  >
                    {term.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            No taxonomy terms match these filters.
          </p>
        )}
      </section>
    </div>
  );
}

function RetentionPanel({
  retention,
  jobs,
}: {
  retention: RetentionPreview;
  jobs: AdminMaintenanceJob[];
}) {
  return (
    <>
      <section
        aria-labelledby="retention-preview-title"
        className="mt-8 rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="retention-preview-title" className="text-lg font-semibold">
          Retention preview
        </h2>
        <dl className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background p-4">
            <dt className="text-sm text-muted-foreground">Expired packages</dt>
            <dd className="mt-2 text-2xl font-semibold">
              {retention.expiredDownloadPackages}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <dt className="text-sm text-muted-foreground">Failed previews</dt>
            <dd className="mt-2 text-2xl font-semibold">
              {retention.failedPlaybackArtifacts}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <dt className="text-sm text-muted-foreground">Cleanup jobs</dt>
            <dd className="mt-2 text-2xl font-semibold">
              {retention.queuedCleanupJobs}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {retention.policyNote}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          SoundVault does not override Microsoft 365 SharePoint/OneDrive
          retention policies.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={queueMaintenanceJobAction}>
            <input type="hidden" name="returnTo" value="/admin/retention" />
            <input type="hidden" name="jobType" value="retention_dry_run" />
            <input type="hidden" name="subjectType" value="retention" />
            <input type="hidden" name="dryRun" value="true" />
            <input
              type="hidden"
              name="requestSummary"
              value="Dry-run derived artifact retention cleanup"
            />
            <Button type="submit" variant="outline">
              Queue dry run
            </Button>
          </form>
          <form action={queueMaintenanceJobAction}>
            <input type="hidden" name="returnTo" value="/admin/retention" />
            <input type="hidden" name="jobType" value="retention_cleanup" />
            <input type="hidden" name="subjectType" value="retention" />
            <input type="hidden" name="dryRun" value="false" />
            <input
              type="hidden"
              name="requestSummary"
              value="Clean expired derived media artifacts after worker recheck"
            />
            <Button type="submit" variant="destructive">
              Queue cleanup
            </Button>
          </form>
        </div>
      </section>
      <JobList jobs={jobs} />
    </>
  );
}

function ActionPanel({ section }: { section: AdminSectionKey }) {
  if (section === "processing") {
    return (
      <section
        className="mt-8 rounded-lg border border-border bg-surface p-5"
        aria-labelledby="processing-actions-title"
      >
        <h2 id="processing-actions-title" className="text-lg font-semibold">
          Queue controls
        </h2>
        <form action={reclaimExpiredJobsAction} className="mt-4">
          <input type="hidden" name="returnTo" value="/admin/processing" />
          <Button type="submit" variant="outline">
            <RefreshCcw aria-hidden="true" data-icon="inline-start" />
            Reclaim expired leases
          </Button>
        </form>
      </section>
    );
  }
  if (section === "catalog" || section === "integrity") {
    return (
      <section
        className="mt-8 rounded-lg border border-border bg-surface p-5"
        aria-labelledby="catalog-actions-title"
      >
        <h2 id="catalog-actions-title" className="text-lg font-semibold">
          Maintenance
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={queueMaintenanceJobAction}>
            <input
              type="hidden"
              name="returnTo"
              value={
                section === "catalog" ? "/admin/catalog" : "/admin/integrity"
              }
            />
            <input
              type="hidden"
              name="jobType"
              value={
                section === "catalog"
                  ? "search_rebuild"
                  : "catalog_integrity_scan"
              }
            />
            <input
              type="hidden"
              name="subjectType"
              value={section === "catalog" ? "catalog" : "integrity"}
            />
            <input type="hidden" name="dryRun" value="true" />
            <input type="hidden" name="maxScope" value="25" />
            <input
              type="hidden"
              name="requestSummary"
              value={
                section === "catalog"
                  ? "Rebuild stale published catalog search documents"
                  : "Scan catalog governance integrity"
              }
            />
            <Button type="submit" variant="outline">
              Queue bounded job
            </Button>
          </form>
        </div>
      </section>
    );
  }
  if (section === "media") {
    return (
      <section
        className="mt-8 rounded-lg border border-border bg-surface p-5"
        aria-labelledby="media-actions-title"
      >
        <h2 id="media-actions-title" className="text-lg font-semibold">
          Derived media
        </h2>
        <form action={queueMaintenanceJobAction} className="mt-4">
          <input type="hidden" name="returnTo" value="/admin/media" />
          <input type="hidden" name="jobType" value="media_reconcile" />
          <input type="hidden" name="subjectType" value="media" />
          <input type="hidden" name="dryRun" value="true" />
          <input
            type="hidden"
            name="requestSummary"
            value="Reconcile derived playback and download package artifacts"
          />
          <Button type="submit" variant="outline">
            Queue reconcile
          </Button>
        </form>
      </section>
    );
  }
  return null;
}

export function AdminWorkspace({
  section,
  metrics = [],
  health = [],
  jobs = [],
  rows = [],
  taxonomyTerms = [],
  taxonomyFilters = {},
  retention,
  notice,
  error,
}: {
  section: AdminSectionKey;
  metrics?: AdminMetric[];
  health?: AdminHealthItem[];
  jobs?: AdminMaintenanceJob[];
  rows?: AdminOperationalRow[];
  taxonomyTerms?: AdminTaxonomyTerm[];
  taxonomyFilters?: { search?: string; category?: string };
  retention?: RetentionPreview;
  notice?: string;
  error?: string;
}) {
  const copy = sectionCopy[section];

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <ResultBanner notice={notice} error={error} />
      <AdminSectionNav active={section} />
      {section === "overview" ? (
        <>
          <MetricsGrid metrics={metrics} />
          <HealthList items={health} />
          <JobList jobs={jobs} />
        </>
      ) : null}
      {section === "system" ? <HealthList items={health} /> : null}
      {section === "team" ? (
        <section
          className="mt-8 rounded-lg border border-border bg-surface p-5"
          aria-labelledby="team-admin-title"
        >
          <h2 id="team-admin-title" className="text-lg font-semibold">
            Team controls
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Team access remains managed by the existing Team workspace so all
            role changes, deactivation, session revocation, and last-admin
            protection continue to use one path.
          </p>
          <Button asChild className="mt-4">
            <Link href="/team">Open Team</Link>
          </Button>
        </section>
      ) : null}
      {section === "taxonomy" ? (
        <TaxonomyPanel terms={taxonomyTerms} filters={taxonomyFilters} />
      ) : null}
      {section === "catalog" ? (
        <>
          <ActionPanel section={section} />
          <RowList
            title="Catalog records"
            rows={rows}
            empty="No catalog records found."
          />
        </>
      ) : null}
      {section === "submissions" ? (
        <RowList
          title="Submission states"
          rows={rows}
          empty="No submissions found."
        />
      ) : null}
      {section === "processing" ? (
        <>
          <ActionPanel section={section} />
          <RowList
            title="Processing jobs"
            rows={rows}
            empty="No processing jobs found."
          />
          <JobList jobs={jobs} />
        </>
      ) : null}
      {section === "media" ? (
        <>
          <ActionPanel section={section} />
          <RowList
            title="Media artifacts"
            rows={rows}
            empty="No media artifacts found."
          />
          <JobList jobs={jobs} />
        </>
      ) : null}
      {section === "copyright" ? (
        <RowList
          title="Manual copyright checks"
          rows={rows}
          empty="No copyright checks found."
        />
      ) : null}
      {section === "demands" ? (
        <RowList
          title="Demand records"
          rows={rows}
          empty="No demand records found."
        />
      ) : null}
      {section === "audit" ? (
        <RowList
          title="Admin events"
          rows={rows}
          empty="No admin audit events have been recorded yet."
        />
      ) : null}
      {section === "retention" && retention ? (
        <RetentionPanel retention={retention} jobs={jobs} />
      ) : null}
      {section === "integrity" ? (
        <>
          <ActionPanel section={section} />
          <RowList
            title="Integrity findings"
            rows={rows}
            empty="No open integrity findings."
          />
          <JobList jobs={jobs} />
        </>
      ) : null}
    </>
  );
}
