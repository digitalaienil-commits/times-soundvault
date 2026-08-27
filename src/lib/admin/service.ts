import "server-only";

import type { QueryResultRow } from "pg";

import { getDatabase } from "@/lib/database/database";

import { getSystemHealthItems } from "./diagnostics";
import { listAdminMaintenanceJobs } from "./maintenance";
import { getRetentionPreview } from "./retention";

export type AdminSectionKey =
  | "overview"
  | "system"
  | "team"
  | "taxonomy"
  | "catalog"
  | "submissions"
  | "processing"
  | "media"
  | "copyright"
  | "demands"
  | "audit"
  | "retention"
  | "integrity";

export interface AdminMetric {
  label: string;
  value: number;
  detail: string;
  href?: string;
}

export interface AdminOperationalRow {
  id: string;
  title: string;
  status: string;
  detail: string;
  href?: string;
}

async function count(sql: string): Promise<number> {
  const result = await getDatabase().query<{ count: string } & QueryResultRow>(
    sql,
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function getAdminOverview() {
  const [
    teamMembers,
    activeAdmins,
    publishedTracks,
    openSubmissions,
    processingJobs,
    mediaJobs,
    copyrightChecks,
    openDemands,
    findings,
  ] = await Promise.all([
    count("SELECT count(*)::text AS count FROM auth.team_access"),
    count(
      "SELECT count(*)::text AS count FROM auth.team_access WHERE role = 'admin' AND status = 'active'",
    ),
    count(
      "SELECT count(*)::text AS count FROM catalog.track WHERE publication_status = 'published'",
    ),
    count(
      "SELECT count(*)::text AS count FROM workflow.submission WHERE status NOT IN ('published','rejected','withdrawn')",
    ),
    count(
      "SELECT count(*)::text AS count FROM analysis.processing_job WHERE status IN ('queued','retry_wait','running','failed')",
    ),
    count(
      "SELECT count(*)::text AS count FROM media.delivery_job WHERE status IN ('queued','running','failed')",
    ),
    count(
      "SELECT count(*)::text AS count FROM rights.copyright_check WHERE status NOT IN ('completed','cancelled')",
    ),
    count(
      "SELECT count(*)::text AS count FROM planning.demand WHERE status IN ('draft','open')",
    ),
    count(
      "SELECT count(*)::text AS count FROM system.integrity_finding WHERE status <> 'resolved'",
    ),
  ]);

  return [
    {
      label: "Team assignments",
      value: teamMembers,
      detail: `${activeAdmins} active Admin${activeAdmins === 1 ? "" : "s"} protected`,
      href: "/admin/team",
    },
    {
      label: "Published tracks",
      value: publishedTracks,
      detail: "Catalog operations are maintenance-only",
      href: "/admin/catalog",
    },
    {
      label: "Open submissions",
      value: openSubmissions,
      detail: "Valid transitions only",
      href: "/admin/submissions",
    },
    {
      label: "Processing jobs",
      value: processingJobs,
      detail: "Retry and reclaim stay queue-bounded",
      href: "/admin/processing",
    },
    {
      label: "Media jobs",
      value: mediaJobs,
      detail: "Derived previews and packages only",
      href: "/admin/media",
    },
    {
      label: "Copyright checks",
      value: copyrightChecks,
      detail: "Manual YouTube observations",
      href: "/admin/copyright",
    },
    {
      label: "Open demands",
      value: openDemands,
      detail: "Supply planning reuses published catalog search",
      href: "/admin/demands",
    },
    {
      label: "Integrity findings",
      value: findings,
      detail: "Open system governance findings",
      href: "/admin/integrity",
    },
  ] satisfies AdminMetric[];
}

export async function getCatalogMaintenanceRows(): Promise<
  AdminOperationalRow[]
> {
  const result = await getDatabase().query<
    {
      id: string;
      title: string | null;
      publication_status: string;
      published_revision_id: string | null;
      updated_at: Date;
      missing_search_document: boolean;
      stale_search_document: boolean;
    } & QueryResultRow
  >(
    `SELECT track.id,
       track.title,
       track.publication_status,
       track.published_revision_id,
       track.updated_at,
       document.track_id IS NULL AS missing_search_document,
       document.updated_at < COALESCE(track.published_at, track.updated_at) AS stale_search_document
     FROM catalog.track track
     LEFT JOIN catalog.track_search_document document ON document.track_id = track.id
     ORDER BY track.updated_at DESC
     LIMIT 50`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title ?? "Untitled track",
    status: row.publication_status,
    detail: row.missing_search_document
      ? "Search document missing"
      : row.stale_search_document
        ? "Search document stale"
        : row.published_revision_id
          ? `Published revision ${row.published_revision_id.slice(0, 8)}`
          : "No published revision",
    href: `/library/${row.id}`,
  }));
}

export async function getSubmissionRows(): Promise<AdminOperationalRow[]> {
  const result = await getDatabase().query<
    {
      id: string;
      title: string | null;
      status: string;
      owner_user_id: string;
      updated_at: Date;
    } & QueryResultRow
  >(
    `SELECT submission.id, track.title, submission.status, submission.owner_user_id, submission.updated_at
     FROM workflow.submission submission
     JOIN catalog.track track ON track.id = submission.track_id
     ORDER BY submission.updated_at DESC
     LIMIT 50`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title ?? "Untitled submission",
    status: row.status,
    detail: `Owner ${row.owner_user_id.slice(0, 8)} · updated ${row.updated_at.toISOString().slice(0, 10)}`,
    href: `/submissions/${row.id}`,
  }));
}

export async function getProcessingRows(): Promise<AdminOperationalRow[]> {
  const result = await getDatabase().query<
    {
      id: string;
      job_type: string;
      status: string;
      attempt_count: number;
      max_attempts: number;
      last_error_message: string | null;
    } & QueryResultRow
  >(
    `SELECT id, job_type, status, attempt_count, max_attempts, last_error_message
     FROM analysis.processing_job
     ORDER BY updated_at DESC
     LIMIT 50`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.job_type.replaceAll("_", " "),
    status: row.status,
    detail:
      row.last_error_message ??
      `Attempt ${row.attempt_count} of ${row.max_attempts}`,
  }));
}

export async function getMediaRows(): Promise<AdminOperationalRow[]> {
  const result = await getDatabase().query<
    {
      id: string;
      label: string;
      status: string;
      detail: string | null;
    } & QueryResultRow
  >(
    `(SELECT artifact.id,
        'Playback preview' AS label,
        artifact.status,
        artifact.last_error_message AS detail,
        artifact.updated_at
      FROM media.playback_artifact artifact)
     UNION ALL
     (SELECT package.id,
        'Download package' AS label,
        package.status,
        package.last_error_message AS detail,
        package.updated_at
      FROM media.download_package package)
     ORDER BY updated_at DESC
     LIMIT 50`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.label,
    status: row.status,
    detail: row.detail ?? "Derived media artifact",
  }));
}

export async function getCopyrightRows(): Promise<AdminOperationalRow[]> {
  const result = await getDatabase().query<
    {
      id: string;
      status: string;
      outcome: string | null;
      updated_at: Date;
    } & QueryResultRow
  >(
    `SELECT id, status, outcome, updated_at
     FROM rights.copyright_check
     ORDER BY updated_at DESC
     LIMIT 50`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: "Manual YouTube observation",
    status: row.status,
    detail: row.outcome ?? "No claim observed status has not been recorded",
  }));
}

export async function getDemandRows(): Promise<AdminOperationalRow[]> {
  const result = await getDatabase().query<
    {
      id: string;
      demand_number: string;
      title: string;
      status: string;
      owner_user_id: string;
    } & QueryResultRow
  >(
    `SELECT id, demand_number::text, title, status, owner_user_id
     FROM planning.demand
     ORDER BY updated_at DESC
     LIMIT 50`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: `#${row.demand_number} ${row.title}`,
    status: row.status,
    detail: `Owner ${row.owner_user_id.slice(0, 8)}`,
    href: `/demands/${row.id}`,
  }));
}

export async function getAuditRows(): Promise<AdminOperationalRow[]> {
  const result = await getDatabase().query<
    {
      id: string;
      subject_type: string;
      subject_id: string | null;
      action: string;
      severity: string;
      created_at: Date;
    } & QueryResultRow
  >(
    `SELECT id, subject_type, subject_id, action, severity, created_at
     FROM system.admin_audit_event
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.action.replaceAll("_", " "),
    status: row.severity,
    detail: `${row.subject_type}${row.subject_id ? ` · ${row.subject_id}` : ""} · ${row.created_at.toISOString()}`,
  }));
}

export async function getIntegrityRows(): Promise<AdminOperationalRow[]> {
  const result = await getDatabase().query<
    {
      id: string;
      title: string;
      severity: string;
      status: string;
      detail: string;
    } & QueryResultRow
  >(
    `SELECT id, title, severity, status, detail
     FROM system.integrity_finding
     ORDER BY status, severity DESC, last_seen_at DESC
     LIMIT 100`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: `${row.severity} ${row.status}`,
    detail: row.detail,
  }));
}

export async function getAdminSectionData(section: AdminSectionKey) {
  if (section === "overview") {
    const [metrics, health, jobs] = await Promise.all([
      getAdminOverview(),
      getSystemHealthItems(),
      listAdminMaintenanceJobs(),
    ]);
    return { metrics, health, jobs };
  }
  if (section === "system") return { health: await getSystemHealthItems() };
  if (section === "catalog") return { rows: await getCatalogMaintenanceRows() };
  if (section === "submissions") return { rows: await getSubmissionRows() };
  if (section === "processing")
    return {
      rows: await getProcessingRows(),
      jobs: await listAdminMaintenanceJobs(),
    };
  if (section === "media")
    return {
      rows: await getMediaRows(),
      jobs: await listAdminMaintenanceJobs(),
    };
  if (section === "copyright") return { rows: await getCopyrightRows() };
  if (section === "demands") return { rows: await getDemandRows() };
  if (section === "audit") return { rows: await getAuditRows() };
  if (section === "retention")
    return {
      retention: await getRetentionPreview(),
      jobs: await listAdminMaintenanceJobs(),
    };
  if (section === "integrity")
    return {
      rows: await getIntegrityRows(),
      jobs: await listAdminMaintenanceJobs(),
    };
  return {};
}
